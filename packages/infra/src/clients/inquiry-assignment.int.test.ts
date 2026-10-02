import {
  AssignInquiry,
  CreateClient,
  DeleteClient,
  EraseClientData,
  ReceiveInquiry,
  type ClientAgents,
  type InquiryMatchCriteria,
  type InquiryPropertyLookup,
  type ReceiveInquiryInput,
} from '@norde/core/clients';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { clientEmails, clients, inquiries, opportunities } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleInquiryMatchQuery } from './drizzle-inquiry-match-query';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-10T15:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const matches = new DrizzleInquiryMatchQuery(db);

const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const AGENT = '00000000-0000-7000-8000-0000000000a1';
const OTHER_AGENT = '00000000-0000-7000-8000-0000000000a2';
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';
const WEB = Actor.system('web', ['inquiries:receive']);
const MANAGER = Actor.user(AGENT, ['inquiries:manage', 'clients:*']).withBranch(BRANCH);

const agents: ClientAgents = {
  names: () => Promise.resolve(new Map<string, string>()),
  find: () => Promise.resolve({ branchId: BRANCH }),
};
const properties: InquiryPropertyLookup = {
  facts: () =>
    Promise.resolve({
      branchId: BRANCH,
      propertyType: 'house',
      operations: ['sale'],
      neighborhood: undefined,
    }),
};
const receive = new ReceiveInquiry({ uow, properties, ids, clock });
const assign = new AssignInquiry({ uow, agents, ids, clock });
const createClient = new CreateClient({ uow, agents, ids, clock });

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function inquiryFrom(overrides: Partial<ReceiveInquiryInput> = {}): Promise<string> {
  const { inquiryId } = unwrap(
    await receive.execute(
      {
        channel: 'zonaprop',
        externalId: ids.next(),
        name: 'Ana Pérez',
        email: 'ana@example.com',
        phone: '+54 9 11 6689-9124',
        message: '¿Sigue disponible?',
        propertyId: PROPERTY,
        ...overrides,
      },
      WEB,
    ),
  );
  return inquiryId;
}

async function client(
  name: string,
  contact: { phones?: string[]; emails?: string[]; agentId?: string },
): Promise<string> {
  const { clientId } = unwrap(
    await createClient.execute(
      {
        name,
        phones: (contact.phones ?? []).map((number) => ({ kind: 'mobile', number })),
        emails: (contact.emails ?? []).map((address) => ({ kind: 'main', address })),
        agentId: contact.agentId ?? AGENT,
      },
      MANAGER,
    ),
  );
  return clientId;
}

/**
 * Un email secundario repetido entre clientes. El alta no lo permite: es un dato cargado antes de
 * que existiera la deduplicación (importado de Tokko).
 */
async function addEmail(clientIds: readonly string[], email: string): Promise<void> {
  const now = new Date('2026-03-10T15:00:00Z');
  await db.insert(clientEmails).values(
    clientIds.map((clientId) => ({
      id: ids.next(),
      clientId,
      kind: 'other',
      email,
      createdAt: now,
      updatedAt: now,
      createdBy: AGENT,
      updatedBy: AGENT,
    })),
  );
}

function criteria(overrides: Partial<InquiryMatchCriteria> = {}): InquiryMatchCriteria {
  return {
    phoneMatchKey: '+541166899124',
    email: 'ana@example.com',
    offset: 0,
    limit: 25,
    ...overrides,
  };
}

describe('AssignInquiry (Postgres)', () => {
  it('assigning again does not create a second client or opportunity', async () => {
    const inquiryId = await inquiryFrom();

    const first = unwrap(await assign.execute({ inquiryId, target: { kind: 'new' } }, MANAGER));
    const again = await assign.execute(
      { inquiryId, target: { kind: 'client', clientId: first.clientId } },
      MANAGER,
    );

    expect(again.isErr() && again.error).toEqual({ type: 'InquiryAlreadyAssigned' });
    expect(await db.select().from(clients)).toHaveLength(1);
    expect(await db.select().from(opportunities)).toHaveLength(1);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId));
    expect(row).toMatchObject({
      status: 'assigned',
      clientId: first.clientId,
      opportunityId: first.opportunityId,
      assignedAgentId: AGENT,
      assignedBy: AGENT,
    });
  });

  it('two assignments at once leave one client and one opportunity', async () => {
    const inquiryId = await inquiryFrom();

    const results = await Promise.all([
      assign.execute({ inquiryId, target: { kind: 'new' } }, MANAGER),
      assign.execute({ inquiryId, target: { kind: 'new' } }, MANAGER),
    ]);

    expect(results.filter((r) => r.isOk())).toHaveLength(1);
    expect(results.find((r) => r.isErr())?.isErr()).toBe(true);
    expect(await db.select().from(clients)).toHaveLength(1);
    expect(await db.select().from(opportunities)).toHaveLength(1);
  });

  it('a second inquiry of the same person adds to the same client and opportunity', async () => {
    const first = unwrap(
      await assign.execute({ inquiryId: await inquiryFrom(), target: { kind: 'new' } }, MANAGER),
    );
    const second = await inquiryFrom({ email: undefined });

    const output = unwrap(
      await assign.execute(
        { inquiryId: second, target: { kind: 'client', clientId: first.clientId } },
        MANAGER,
      ),
    );

    expect(output).toMatchObject({
      clientId: first.clientId,
      opportunityId: first.opportunityId,
      clientCreated: false,
      opportunityCreated: false,
    });
    expect(await db.select().from(opportunities)).toHaveLength(1);
  });
});

describe('DrizzleInquiryMatchQuery', () => {
  it('finds the clients by any of their phones or emails, phone first and active first', async () => {
    const byEmail = await client('Ana (mail)', {
      phones: ['+541147770000'],
      emails: ['ana@example.com'],
    });
    const bySecondPhone = await client('Ana (celular)', {
      phones: ['+541155550000', '+541166899124'],
      agentId: OTHER_AGENT,
    });
    const trashed = await client('Ana (borrada)', {
      phones: ['+541133330000'],
      emails: ['otra@example.com'],
    });
    await addEmail([trashed], 'ANA@example.com');
    unwrap(await new DeleteClient({ uow, clock }).execute({ clientId: trashed }, MANAGER));
    await client('Juan', { phones: ['+541122220000'], emails: ['juan@example.com'] });

    const page = await matches.search(criteria());

    expect(page.total).toBe(3);
    expect(page.items.map((m) => m.id)).toEqual([bySecondPhone, byEmail, trashed]);
    expect(page.items[0]).toMatchObject({
      name: 'Ana (celular)',
      agentId: OTHER_AGENT,
      branchId: BRANCH,
      matchedByPhone: true,
      matchedByEmail: false,
      createdAt: new Date('2026-03-10T15:00:00Z'),
      deletedAt: undefined,
    });
    expect(page.items[1]).toMatchObject({ matchedByPhone: false, matchedByEmail: true });
    expect(page.items[2]?.deletedAt).toEqual(new Date('2026-03-10T15:00:00Z'));
  });

  it('pages without losing or repeating clients', async () => {
    const shared = [];
    for (const n of [1, 2, 3]) {
      shared.push(
        await client(`Bea ${n}`, { phones: [`+54115555000${n}`], emails: [`bea${n}@example.com`] }),
      );
    }
    await addEmail(shared, 'Bea@example.com');
    const byEmail = { phoneMatchKey: undefined, email: 'bea@example.com' };

    const first = await matches.search(criteria({ ...byEmail, limit: 2 }));
    const second = await matches.search(criteria({ ...byEmail, offset: 2, limit: 2 }));

    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect([...first.items, ...second.items].map((m) => m.id).sort()).toEqual([...shared].sort());
  });

  it('finds nothing without a phone or an email', async () => {
    await client('Ana', { phones: ['+5491166899124'] });

    expect(await matches.search(criteria({ phoneMatchKey: undefined, email: undefined }))).toEqual({
      items: [],
      total: 0,
    });
  });
});

describe('EraseClientData and inquiries (Postgres)', () => {
  it('erases the unassigned inquiries with the phone or email of the client', async () => {
    const ana = await client('Ana Pérez', {
      phones: ['+5491166899124'],
      emails: ['ana@example.com', 'ana.perez@example.com'],
    });
    // Por el teléfono y por el email secundario.
    await inquiryFrom({ email: undefined });
    await inquiryFrom({ phone: undefined, email: 'Ana.Perez@example.com' });
    const assigned = await inquiryFrom();
    unwrap(
      await assign.execute(
        { inquiryId: assigned, target: { kind: 'client', clientId: ana } },
        MANAGER,
      ),
    );
    const someoneElse = await inquiryFrom({ phone: '+5491155550000', email: 'juan@example.com' });

    unwrap(
      await new EraseClientData({ uow, ids, clock }).execute(
        { clientId: ana, confirmation: 'ana perez', requestedOn: '2026-03-10' },
        MANAGER,
      ),
    );

    const left = await db.select({ id: inquiries.id }).from(inquiries);
    expect(left.map((r) => r.id)).toEqual([someoneElse]);
  });
});
