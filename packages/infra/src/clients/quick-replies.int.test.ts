import {
  CreateQuickReply,
  DeleteQuickReply,
  GetQuickReply,
  ListQuickReplies,
  SetQuickReplyActive,
  UpdateQuickReply,
} from '@norde/core/clients';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, quickReplies } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleQuickReplyQuery } from './drizzle-quick-reply-query';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-10T15:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const MANAGER = Actor.user('00000000-0000-7000-8000-0000000000a1', ['quick-replies:manage']);

const create = new CreateQuickReply({ uow, ids, clock });
const update = new UpdateQuickReply({ uow, clock });
const setActive = new SetQuickReplyActive({ uow, clock });
const remove = new DeleteQuickReply({ uow });
const get = new GetQuickReply({ uow });
const list = new ListQuickReplies({ replies: new DrizzleQuickReplyQuery(db) });

function unwrap<T>(result: Result<T, unknown>): T {
  if (result.isErr()) throw new Error(`Unexpected error: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function seed(name: string): Promise<string> {
  return unwrap(await create.execute({ name, body: `Hola, ${name}` }, MANAGER)).quickReplyId;
}

describe('quick replies', () => {
  it('saves, edits and deletes one, with its authorship and audit', async () => {
    const id = await seed('Primer contacto');

    unwrap(
      await update.execute(
        {
          quickReplyId: id,
          name: 'Primer contacto',
          subject: 'Hola [[primer_nombre_contacto]]',
          body: 'Soy [[nombre_asesor]]',
        },
        MANAGER,
      ),
    );
    expect(unwrap(await get.execute({ quickReplyId: id }, MANAGER))).toMatchObject({
      subject: 'Hola [[primer_nombre_contacto]]',
      body: 'Soy [[nombre_asesor]]',
      isActive: true,
    });
    const [row] = await db.select().from(quickReplies).where(eq(quickReplies.id, id));
    expect(row).toMatchObject({ createdBy: MANAGER.id, updatedBy: MANAGER.id, automation: null });

    unwrap(await remove.execute({ quickReplyId: id }, MANAGER));
    expect(await db.select().from(quickReplies).where(eq(quickReplies.id, id))).toEqual([]);
    const actions = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, id));
    expect(actions.map((a) => a.action).sort()).toEqual([
      'quick_reply.created',
      'quick_reply.deleted',
      'quick_reply.updated',
    ]);
  });

  it('pages by name without losing or repeating rows, and filters by status and text', async () => {
    const names = ['Visita', 'Álquiler anual', 'Alquiler temporario', 'Bienvenida', 'Cierre'];
    const created = new Map<string, string>();
    for (const name of names) created.set(name, await seed(name));
    unwrap(
      await setActive.execute(
        { quickReplyId: created.get('Cierre') ?? '', active: false },
        MANAGER,
      ),
    );

    const all = unwrap(await list.execute({ pageSize: 100 }, MANAGER));
    expect(all.total).toBe(4);
    expect(all.items.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Visita', 'Álquiler anual', 'Alquiler temporario', 'Bienvenida']),
    );
    const pages = [];
    for (let page = 1; page <= 2; page += 1) {
      pages.push(unwrap(await list.execute({ page, pageSize: 2 }, MANAGER)));
    }
    expect(pages.flatMap((p) => p.items.map((row) => row.id))).toEqual(
      all.items.map((row) => row.id),
    );

    const descending = unwrap(await list.execute({ sort: '-name', pageSize: 100 }, MANAGER));
    expect(descending.items.map((row) => row.id)).toEqual(all.items.map((row) => row.id).reverse());

    const searched = unwrap(await list.execute({ q: 'ALQUILER' }, MANAGER));
    expect(searched.items.map((row) => row.name).sort()).toEqual([
      'Alquiler temporario',
      'Álquiler anual',
    ]);

    const inactive = unwrap(await list.execute({ status: 'inactive' }, MANAGER));
    expect(inactive.items.map((row) => row.name)).toEqual(['Cierre']);
  });
});
