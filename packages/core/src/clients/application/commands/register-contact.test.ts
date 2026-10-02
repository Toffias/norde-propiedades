import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator } from '../../../shared/testing';
import type { RegisterContactInput } from '../../contracts';
import { InMemoryClientsUnitOfWork, seedClient, stageFixtureId } from '../../testing';

import { RegisterContact } from './register-contact';

const agent = Actor.system('agent-ia', ['clients:create']);
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000aa';

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const useCase = new RegisterContact({ uow, ids: new SequentialIdGenerator(), clock });
  return { uow, clock, useCase };
}

function whatsappContact(overrides: Partial<RegisterContactInput> = {}): RegisterContactInput {
  return {
    channel: 'whatsapp',
    channelExternalId: '5491166899124',
    phone: '+5491166899124',
    name: 'Ana',
    opportunity: { type: 'rent', intent: 'visit', propertyId: PROPERTY_ID, note: 'Quiere visitar' },
    ...overrides,
  };
}

describe('RegisterContact', () => {
  it('registers a new client with an opportunity, events and audit', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(whatsappContact(), agent);

    expect(result.isOk() && result.value).toMatchObject({
      clientCreated: true,
      opportunityCreated: true,
    });
    expect(uow.clients.rows.size).toBe(1);
    const [opportunity] = [...uow.opportunities.rows.values()];
    expect(opportunity).toMatchObject({
      type: 'rent',
      intent: 'visit',
      status: 'new',
      originChannel: 'whatsapp',
      propertyId: PROPERTY_ID,
    });
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'clients.client_registered',
      'clients.opportunity_created',
    ]);
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'client.registered',
      'opportunity.opened',
    ]);
    const [clientEntry, opportunityEntry] = uow.audit.entries;
    const clientId = result.isOk() ? result.value.clientId : '';
    expect(clientEntry).toEqual({
      kind: 'created',
      actorId: 'system:agent-ia',
      source: 'agent',
      action: 'client.registered',
      entityType: 'client',
      entityId: clientId,
      clientIds: [clientId],
      changes: {
        kind: { before: null, after: 'person' },
        name: { before: null, after: 'Ana' },
        phones: { before: null, after: [{ kind: 'mobile', number: '+5491166899124' }] },
      },
    });
    expect(opportunityEntry).toMatchObject({
      kind: 'created',
      clientIds: [clientId],
      changes: {
        clientId: { before: null, after: clientId },
        type: { before: null, after: 'rent' },
        status: { before: null, after: 'new' },
        propertyId: { before: null, after: PROPERTY_ID },
      },
    });
  });

  it('opens the opportunity in its editable stage and records it in the history', async () => {
    const { uow, useCase } = setup();

    await useCase.execute(whatsappContact(), agent);

    const [opportunity] = [...uow.opportunities.rows.values()];
    expect(opportunity).toMatchObject({ status: 'new', stageId: stageFixtureId(0) });
    expect(uow.opportunities.statusChanges).toEqual([
      expect.objectContaining({
        fromStatus: undefined,
        toStageId: stageFixtureId(0),
        toStatus: 'new',
        changedBy: 'system:agent-ia',
      }),
    ]);
  });

  it('uses the stage of the "on create" rule and inherits the agent of the client', async () => {
    const { uow, useCase } = setup();
    const contacted = stageFixtureId(1);
    uow.opportunitySettings.rules = { ...uow.opportunitySettings.rules, onCreate: contacted };
    await seedClient(uow, { agentId: 'agent-7', branchId: 'branch-7' });

    await useCase.execute(whatsappContact(), agent);

    const [opportunity] = [...uow.opportunities.rows.values()];
    expect(opportunity).toMatchObject({
      status: 'contacted',
      stageId: contacted,
      agentId: 'agent-7',
      branchId: 'branch-7',
    });
  });

  it('deduplicates by phone, even when written without the mobile 9', async () => {
    const { uow, useCase } = setup();
    await useCase.execute(whatsappContact(), agent);

    const result = await useCase.execute(
      {
        channel: 'web_form',
        channelExternalId: 'form-1',
        phone: '11 6689-9124',
        email: 'ana@mail.com',
        opportunity: { type: 'sale', intent: 'contact' },
      },
      agent,
    );

    expect(result.isOk() && result.value.clientCreated).toBe(false);
    expect(uow.clients.rows.size).toBe(1);
    const [client] = [...uow.clients.rows.values()];
    expect(client?.channels.map((c) => c.channel)).toEqual(['whatsapp', 'web_form']);
    expect(client?.emails[0]?.email.value).toBe('ana@mail.com');
    expect(uow.opportunities.rows.size).toBe(2);
  });

  it('deduplicates by email when there is no phone match', async () => {
    const { uow, useCase } = setup();
    await useCase.execute(
      {
        channel: 'zonaprop',
        channelExternalId: 'lead-1',
        email: 'Ana@Mail.com',
        opportunity: { type: 'rent', intent: 'info' },
      },
      agent,
    );

    await useCase.execute(whatsappContact({ email: 'ana@mail.com' }), agent);

    expect(uow.clients.rows.size).toBe(1);
    expect([...uow.clients.rows.values()][0]?.phones[0]?.phone.e164).toBe('+5491166899124');
  });

  it('adds the request to the open opportunity about the same property', async () => {
    const { uow, useCase } = setup();
    await useCase.execute(
      whatsappContact({ opportunity: { type: 'rent', intent: 'info', propertyId: PROPERTY_ID } }),
      agent,
    );

    const result = await useCase.execute(whatsappContact(), agent);

    expect(result.isOk() && result.value.opportunityCreated).toBe(false);
    expect(uow.opportunities.rows.size).toBe(1);
    expect([...uow.opportunities.rows.values()][0]?.intent).toBe('visit');
    expect(uow.events.published.at(-1)?.type).toBe('clients.opportunity_request_added');
    expect(uow.audit.entries.at(-1)).toMatchObject({
      kind: 'action',
      action: 'opportunity.request_added',
      changes: { intent: { before: 'info', after: 'visit' } },
    });
    expect(uow.audit.entries.at(-2)).toMatchObject({
      kind: 'action',
      action: 'client.contact_recorded',
    });
    expect(uow.audit.entries.at(-2)).not.toHaveProperty('changes');
  });

  it('opens the opportunity as "Aplica a otra inmobiliaria" when there is no matching stock', async () => {
    const { uow, useCase } = setup();

    await useCase.execute(
      whatsappContact({
        opportunity: {
          type: 'rent',
          intent: 'contact',
          noMatchingStock: true,
          search: { operation: 'rent', location: 'Tigre', maxPriceCents: 50_000_000n },
        },
      }),
      agent,
    );

    const [opportunity] = [...uow.opportunities.rows.values()];
    expect(opportunity?.status).toBe('referred_to_partner');
    expect(opportunity?.search).toMatchObject({ location: 'Tigre' });
  });

  it('moves an open new opportunity to "Aplica a otra inmobiliaria"', async () => {
    const { uow, useCase } = setup();
    const general = { type: 'rent', intent: 'info' } as const;
    await useCase.execute(whatsappContact({ opportunity: general }), agent);

    await useCase.execute(
      whatsappContact({ opportunity: { ...general, noMatchingStock: true } }),
      agent,
    );

    expect([...uow.opportunities.rows.values()][0]?.status).toBe('referred_to_partner');
  });

  it.each([
    [{ phone: '123' }, 'InvalidPhone'],
    [{ phone: undefined, email: 'no-es-un-mail' }, 'InvalidEmail'],
    [{ phone: undefined }, 'MissingContactInfo'],
    [{ channelExternalId: '' }, 'InvalidInput'],
  ] as const)('rejects %o with %s and writes nothing', async (overrides, type) => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(whatsappContact(overrides), agent);

    expect(result.isErr() && result.error.type).toBe(type);
    expect(uow.clients.rows.size).toBe(0);
    expect(uow.opportunities.rows.size).toBe(0);
    expect(uow.events.published).toEqual([]);
  });

  it('requires clients:create', async () => {
    const { uow, useCase } = setup();

    const result = await useCase.execute(whatsappContact(), Actor.system('web', []));

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
    expect(uow.clients.rows.size).toBe(0);
  });

  it('restores a client in the trash that writes again, instead of duplicating it', async () => {
    const { uow, useCase } = setup();
    const trashed = await seedClient(uow, { phones: ['+541166899124'], deleted: true });

    const result = await useCase.execute(whatsappContact(), agent);

    expect(result.isOk() && result.value).toMatchObject({
      clientId: trashed.id,
      clientCreated: false,
    });
    expect(uow.clients.rows.get(trashed.id)?.deletedAt).toBeUndefined();
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'client.restored',
      'client.contact_recorded',
      'opportunity.opened',
    ]);
  });
});
