import {
  RegisterContact,
  type OpportunityId,
  type RegisterContactInput,
} from '@norde/core/clients';
import { Actor, err, ok, Phone, type AuditEntry } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, clientChannels, clients, opportunities, outbox } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import {
  DrizzleClientRepository,
  DrizzleOpportunityRepository,
} from './drizzle-client-repositories';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-01T10:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const registerContact = new RegisterContact({ uow, ids, clock });
const agent = Actor.system('agent-ia', ['clients:create']).withCorrelation('wamid.1');
const TEST_ENTRY: AuditEntry = {
  kind: 'action',
  actorId: 'test',
  action: 'x',
  entityType: 'x',
  entityId: 'x',
  source: 'scheduler',
  clientIds: [],
};

const whatsapp: RegisterContactInput = {
  channel: 'whatsapp',
  channelExternalId: '5491166899124',
  phone: '+5491166899124',
  name: 'Ana',
  opportunity: {
    type: 'rent',
    intent: 'visit',
    note: 'Quiere visitar el sábado',
    search: { location: 'Palermo', maxPriceCents: 80_000_000n, amenities: ['balcón'] },
  },
};

describe('clients persistence', () => {
  it('persists a registered contact with channel, opportunity, outbox events and audit', async () => {
    const result = await registerContact.execute(whatsapp, agent);
    if (result.isErr()) throw new Error(result.error.type);

    expect(await db.select().from(clients)).toHaveLength(1);
    expect(await db.select().from(clientChannels)).toMatchObject([
      { channel: 'whatsapp', externalId: '5491166899124' },
    ]);
    expect((await db.select().from(outbox)).map((e) => e.eventType).sort()).toEqual([
      'clients.client_registered',
      'clients.opportunity_created',
    ]);
    const entries = await db.select().from(auditLog).orderBy(auditLog.entityType);
    expect(entries).toMatchObject([
      {
        action: 'client.registered',
        source: 'agent',
        correlationId: 'wamid.1',
        clientIds: [result.value.clientId],
        changes: { phone: { before: null, after: '+5491166899124' } },
      },
      {
        action: 'opportunity.opened',
        clientIds: [result.value.clientId],
        // Los centavos se guardan crudos, marcados para recuperar el bigint (`toJsonb`).
        changes: { search: { after: { maxPriceCents: { $bigint: '80000000' } } } },
      },
    ]);

    const opportunity = await new DrizzleOpportunityRepository(db).findById(
      result.value.opportunityId as OpportunityId,
    );
    expect(opportunity?.toSnapshot()).toMatchObject({
      type: 'rent',
      intent: 'visit',
      status: 'new',
      search: { location: 'Palermo', maxPriceCents: 80_000_000n, amenities: ['balcón'] },
      notes: [{ text: 'Quiere visitar el sábado', createdAt: clock.now() }],
    });
  });

  it('finds the same client by phone with or without the mobile 9, and by email', async () => {
    await registerContact.execute({ ...whatsapp, email: 'ana@mail.com' }, agent);
    const repository = new DrizzleClientRepository(db);

    const byLandlineFormat = await repository.findByPhone(
      Phone.create('11 6689-9124').unwrapOr(undefined as never),
    );

    expect(byLandlineFormat?.name).toBe('Ana');
    expect(byLandlineFormat?.phone?.e164).toBe('+5491166899124');
    expect(byLandlineFormat?.channels).toHaveLength(1);
  });

  it('deduplicates across channels and keeps one row per client', async () => {
    await registerContact.execute(whatsapp, agent);
    clock.advance(60_000);

    const second = await registerContact.execute(
      {
        channel: 'zonaprop',
        channelExternalId: 'lead-7',
        phone: '11 6689-9124',
        email: 'ana@mail.com',
        opportunity: { type: 'sale', intent: 'contact' },
      },
      agent,
    );

    expect(second.isOk() && second.value.clientCreated).toBe(false);
    expect(await db.select().from(clients)).toMatchObject([{ email: 'ana@mail.com' }]);
    expect(await db.select().from(clientChannels)).toHaveLength(2);
    expect(await db.select().from(opportunities)).toHaveLength(2);
  });

  it('rolls back everything written when the work returns an Err', async () => {
    const result = await uow.run(async (tx) => {
      await tx.events.publish([
        { type: 'test.event', aggregateId: 'x', occurredAt: clock.now(), payload: {} },
      ]);
      await tx.audit.record(TEST_ENTRY);
      return err({ type: 'Nope' });
    });

    expect(result.isErr()).toBe(true);
    expect(await db.select().from(outbox)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it('commits when the work returns Ok', async () => {
    await uow.run(async (tx) => {
      await tx.audit.record(TEST_ENTRY);
      return ok(undefined);
    });

    expect(await db.select().from(auditLog)).toHaveLength(1);
  });
});
