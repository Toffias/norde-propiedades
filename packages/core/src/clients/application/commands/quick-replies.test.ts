import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { CreateQuickReplyInput } from '../../contracts';
import {
  AGENT_ID,
  InMemoryClientsUnitOfWork,
  InMemoryQuickReplyQuery,
  OTHER_AGENT_ID,
  seedQuickReply,
} from '../../testing';
import { GetQuickReply } from '../queries/get-quick-reply';
import { ListQuickReplies } from '../queries/list-quick-replies';

import { CreateQuickReply } from './create-quick-reply';
import { DeleteQuickReply } from './delete-quick-reply';
import { SetQuickReplyActive } from './set-quick-reply-active';
import { UpdateQuickReply } from './update-quick-reply';

const MANAGER = Actor.user(AGENT_ID, ['quick-replies:manage']);
/** Puede enviarle propiedades a sus contactos, pero no administra las plantillas. */
const ADVISOR = Actor.user(OTHER_AGENT_ID, ['clients:read', 'clients:update']);
const READER = Actor.user(OTHER_AGENT_ID, ['clients:read']);
const MISSING_ID = '00000000-0000-7000-8000-0000000000c9';

const INPUT: CreateQuickReplyInput = {
  name: 'Primer contacto',
  subject: 'Hola [[primer_nombre_contacto]]',
  body: 'Soy [[nombre_asesor]], de [[nombre_empresa]]. Te paso lo que hablamos.',
};

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  return {
    uow,
    create: new CreateQuickReply({ uow, ids: new SequentialIdGenerator(), clock }),
    update: new UpdateQuickReply({ uow, clock }),
    setActive: new SetQuickReplyActive({ uow, clock }),
    remove: new DeleteQuickReply({ uow }),
    list: new ListQuickReplies({ replies: new InMemoryQuickReplyQuery(uow.quickReplies) }),
    get: new GetQuickReply({ uow }),
  };
}

describe('CreateQuickReply', () => {
  it('creates an active quick reply and audits its values', async () => {
    const { uow, create } = setup();

    const { quickReplyId } = unwrap(await create.execute(INPUT, MANAGER));

    expect(uow.quickReplies.rows.get(quickReplyId)).toMatchObject({
      name: 'Primer contacto',
      subject: 'Hola [[primer_nombre_contacto]]',
      isActive: true,
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'quick_reply.created',
        entityType: 'quick_reply',
        entityId: quickReplyId,
        clientIds: [],
        changes: {
          name: { before: null, after: 'Primer contacto' },
          subject: { before: null, after: 'Hola [[primer_nombre_contacto]]' },
          body: { before: null, after: INPUT.body },
          isActive: { before: null, after: true },
        },
      }),
    ]);
  });

  it('rejects unknown variables and saves nothing', async () => {
    const { uow, create } = setup();

    expect(unwrapErr(await create.execute({ ...INPUT, body: 'Hola [[nombre]]' }, MANAGER))).toEqual(
      { type: 'InvalidQuickReply', reason: 'unknown_variables', variables: ['nombre'] },
    );
    expect(uow.quickReplies.rows.size).toBe(0);
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects an invalid input', async () => {
    const { create } = setup();

    expect(unwrapErr(await create.execute({ ...INPUT, name: '' }, MANAGER))).toMatchObject({
      type: 'InvalidInput',
    });
  });

  it('needs quick-replies:manage', async () => {
    const { uow, create } = setup();

    expect(unwrapErr(await create.execute(INPUT, ADVISOR))).toEqual({ type: 'Forbidden' });
    expect(uow.quickReplies.rows.size).toBe(0);
  });
});

describe('UpdateQuickReply', () => {
  it('saves the changes and audits only what changed', async () => {
    const { uow, update } = setup();
    const reply = await seedQuickReply(uow, { body: 'Hola' });

    unwrap(
      await update.execute(
        { quickReplyId: reply.id, name: 'Primer contacto', body: 'Hola [[nombre_contacto]]' },
        MANAGER,
      ),
    );

    expect(uow.quickReplies.rows.get(reply.id)?.body).toBe('Hola [[nombre_contacto]]');
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        action: 'quick_reply.updated',
        entityId: reply.id,
        changes: { body: { before: 'Hola', after: 'Hola [[nombre_contacto]]' } },
      }),
    ]);
  });

  it('does not audit an edit without changes', async () => {
    const { uow, update } = setup();
    const reply = await seedQuickReply(uow, { body: 'Hola' });

    unwrap(
      await update.execute(
        { quickReplyId: reply.id, name: 'Primer contacto', body: ' Hola ' },
        MANAGER,
      ),
    );

    expect(uow.audit.entries).toEqual([]);
  });

  it('fails for a quick reply that does not exist, and without permission', async () => {
    const { uow, update } = setup();
    const reply = await seedQuickReply(uow);

    expect(
      unwrapErr(
        await update.execute({ quickReplyId: MISSING_ID, name: 'Otra', body: 'Hola' }, MANAGER),
      ),
    ).toEqual({ type: 'QuickReplyNotFound' });
    expect(
      unwrapErr(
        await update.execute({ quickReplyId: reply.id, name: 'Otra', body: 'Hola' }, ADVISOR),
      ),
    ).toEqual({ type: 'Forbidden' });
  });

  it('rejects unknown variables', async () => {
    const { uow, update } = setup();
    const reply = await seedQuickReply(uow);

    expect(
      unwrapErr(
        await update.execute(
          { quickReplyId: reply.id, name: 'Otra', subject: '[[precio]]', body: 'Hola' },
          MANAGER,
        ),
      ),
    ).toEqual({ type: 'InvalidQuickReply', reason: 'unknown_variables', variables: ['precio'] });
    expect(uow.audit.entries).toEqual([]);
  });
});

describe('SetQuickReplyActive', () => {
  it('deactivates and activates, auditing each change as an action', async () => {
    const { uow, setActive } = setup();
    const reply = await seedQuickReply(uow);

    unwrap(await setActive.execute({ quickReplyId: reply.id, active: false }, MANAGER));
    unwrap(await setActive.execute({ quickReplyId: reply.id, active: false }, MANAGER));
    unwrap(await setActive.execute({ quickReplyId: reply.id, active: true }, MANAGER));

    expect(uow.quickReplies.rows.get(reply.id)?.isActive).toBe(true);
    expect(uow.audit.entries.map((e) => [e.kind, e.action])).toEqual([
      ['action', 'quick_reply.deactivated'],
      ['action', 'quick_reply.activated'],
    ]);
  });

  it('fails for a quick reply that does not exist, and without permission', async () => {
    const { uow, setActive } = setup();
    const reply = await seedQuickReply(uow);

    expect(
      unwrapErr(await setActive.execute({ quickReplyId: MISSING_ID, active: false }, MANAGER)),
    ).toEqual({ type: 'QuickReplyNotFound' });
    expect(
      unwrapErr(await setActive.execute({ quickReplyId: reply.id, active: false }, ADVISOR)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('DeleteQuickReply', () => {
  it('deletes it and keeps its values in the audit log', async () => {
    const { uow, remove } = setup();
    const reply = await seedQuickReply(uow, { body: 'Hola', subject: 'Asunto' });

    unwrap(await remove.execute({ quickReplyId: reply.id }, MANAGER));

    expect(uow.quickReplies.rows.has(reply.id)).toBe(false);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'quick_reply.deleted',
        entityId: reply.id,
        changes: {
          name: { before: 'Primer contacto', after: null },
          subject: { before: 'Asunto', after: null },
          body: { before: 'Hola', after: null },
          isActive: { before: true, after: null },
        },
      }),
    ]);
  });

  it('fails for a quick reply that does not exist, and without permission', async () => {
    const { uow, remove } = setup();
    const reply = await seedQuickReply(uow);

    expect(unwrapErr(await remove.execute({ quickReplyId: MISSING_ID }, MANAGER))).toEqual({
      type: 'QuickReplyNotFound',
    });
    expect(unwrapErr(await remove.execute({ quickReplyId: reply.id }, ADVISOR))).toEqual({
      type: 'Forbidden',
    });
    expect(uow.quickReplies.rows.has(reply.id)).toBe(true);
  });
});

describe('ListQuickReplies', () => {
  it('pages the active ones by name, filtered by text', async () => {
    const { uow, list } = setup();
    await seedQuickReply(uow, { name: 'Visita' });
    await seedQuickReply(uow, { name: 'Alquiler temporario' });
    await seedQuickReply(uow, { name: 'Alquiler anual' });
    await seedQuickReply(uow, { name: 'Alquiler vencido', isActive: false });

    const page = unwrap(await list.execute({ q: 'alquiler', pageSize: 1, page: 2 }, MANAGER));

    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(page.items.map((row) => row.name)).toEqual(['Alquiler temporario']);
  });

  it('shows the inactive ones only to who manages them', async () => {
    const { uow, list } = setup();
    await seedQuickReply(uow, { name: 'Vieja', isActive: false });

    const inactive = unwrap(await list.execute({ status: 'inactive' }, MANAGER));
    expect(inactive.items.map((row) => row.name)).toEqual(['Vieja']);
    expect(unwrapErr(await list.execute({ status: 'inactive' }, ADVISOR))).toEqual({
      type: 'Forbidden',
    });
  });

  it('lets an advisor who can send pick the active ones, but not a reader', async () => {
    const { uow, list } = setup();
    await seedQuickReply(uow, { name: 'Visita' });

    expect(unwrap(await list.execute({}, ADVISOR)).total).toBe(1);
    expect(unwrapErr(await list.execute({}, READER))).toEqual({ type: 'Forbidden' });
  });

  it('rejects an invalid query', async () => {
    const { list } = setup();

    expect(unwrapErr(await list.execute({ pageSize: 1000 }, MANAGER))).toMatchObject({
      type: 'InvalidInput',
    });
  });
});

describe('GetQuickReply', () => {
  it('returns an active one to an advisor and an inactive one only to a manager', async () => {
    const { uow, get } = setup();
    const active = await seedQuickReply(uow, { name: 'Visita' });
    const inactive = await seedQuickReply(uow, { name: 'Vieja', isActive: false });

    expect(unwrap(await get.execute({ quickReplyId: active.id }, ADVISOR))).toMatchObject({
      id: active.id,
      name: 'Visita',
    });
    expect(unwrap(await get.execute({ quickReplyId: inactive.id }, MANAGER)).isActive).toBe(false);
    expect(unwrapErr(await get.execute({ quickReplyId: inactive.id }, ADVISOR))).toEqual({
      type: 'QuickReplyNotFound',
    });
  });

  it('fails without permission and for one that does not exist', async () => {
    const { uow, get } = setup();
    const reply = await seedQuickReply(uow);

    expect(unwrapErr(await get.execute({ quickReplyId: reply.id }, READER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await get.execute({ quickReplyId: MISSING_ID }, MANAGER))).toEqual({
      type: 'QuickReplyNotFound',
    });
  });
});
