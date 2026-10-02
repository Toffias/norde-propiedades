import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { AssignInquiryInput } from '../../contracts';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  InMemoryInquiryPropertyLookup,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  PROPERTY_ID,
  seedClient,
  seedOpportunity,
} from '../../testing';

import { AssignInquiry } from './assign-inquiry';
import { DeleteInquiry } from './delete-inquiry';
import { ReceiveInquiry } from './receive-inquiry';

const WEB = Actor.system('web', ['inquiries:receive']);
/** Quien asigna es un agente activo (Camila). */
const MANAGER = Actor.user(AGENT_ID, ['inquiries:manage']);
const READER = Actor.user(OTHER_AGENT_ID, ['inquiries:read']);
const UNKNOWN_USER = '00000000-0000-7000-8000-0000000000c9';

const INQUIRY = {
  channel: 'zonaprop',
  externalId: 'ZP-123',
  name: 'Ana Pérez',
  phone: '+54 9 11 6689-9124',
  email: 'ana@example.com',
  message: 'Hola, ¿sigue disponible?',
  propertyId: PROPERTY_ID,
} as const;

async function setup(operations: readonly string[] = ['sale']) {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const ids = new SequentialIdGenerator();
  const properties = new InMemoryInquiryPropertyLookup();
  properties.known.set(PROPERTY_ID, {
    branchId: OTHER_BRANCH_ID,
    propertyType: 'apartment',
    operations,
    neighborhood: 'Palermo',
  });
  const receive = new ReceiveInquiry({ uow, properties, ids, clock });
  const { inquiryId } = unwrap(await receive.execute(INQUIRY, WEB));
  // Lo que importa es lo que escribe la asignación.
  uow.events.published.length = 0;
  uow.audit.entries.length = 0;
  return {
    uow,
    inquiryId,
    assign: new AssignInquiry({ uow, agents: new InMemoryClientAgents(), ids, clock }),
    deleteInquiry: new DeleteInquiry({ uow, clock }),
  };
}

function toNew(inquiryId: string, overrides: Partial<AssignInquiryInput> = {}): AssignInquiryInput {
  return { inquiryId, target: { kind: 'new' }, ...overrides };
}

describe('AssignInquiry to a matching client', () => {
  it('records the contact, opens an opportunity and leaves the inquiry assigned', async () => {
    const { uow, inquiryId, assign } = await setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });

    const output = unwrap(
      await assign.execute({ inquiryId, target: { kind: 'client', clientId: client.id } }, MANAGER),
    );

    expect(output).toMatchObject({
      clientId: client.id,
      clientCreated: false,
      opportunityCreated: true,
    });
    expect(uow.opportunities.rows.get(output.opportunityId)).toMatchObject({
      clientId: client.id,
      originChannel: 'zonaprop',
      type: 'sale',
      intent: 'contact',
      propertyId: PROPERTY_ID,
      // Sin elegir agente, queda con el del cliente.
      agentId: OTHER_AGENT_ID,
      notes: [expect.objectContaining({ text: INQUIRY.message })],
    });
    expect(uow.clients.rows.get(client.id)?.channels).toEqual([
      expect.objectContaining({ channel: 'zonaprop', externalId: 'ana@example.com' }),
    ]);
    expect(uow.inquiries.rows.get(inquiryId)).toMatchObject({
      status: 'assigned',
      clientId: client.id,
      opportunityId: output.opportunityId,
      assignedAgentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
      assignedBy: AGENT_ID,
      assignedAt: new Date('2026-03-01T10:00:00Z'),
    });
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'clients.client_channel_added',
      'clients.opportunity_created',
      'clients.inquiry_assigned',
    ]);
  });

  it('audits the assignment against the client, without the sender data', async () => {
    const { uow, inquiryId, assign } = await setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });

    const { opportunityId } = unwrap(
      await assign.execute({ inquiryId, target: { kind: 'client', clientId: client.id } }, MANAGER),
    );

    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'client.contact_recorded',
      'opportunity.opened',
      'inquiry.assigned',
    ]);
    expect(uow.audit.entries.at(-1)).toEqual({
      kind: 'action',
      action: 'inquiry.assigned',
      entityType: 'inquiry',
      entityId: inquiryId,
      actorId: AGENT_ID,
      source: 'gestion',
      clientIds: [client.id],
      changes: {
        status: { before: 'pending', after: 'assigned' },
        clientId: { before: null, after: client.id },
        opportunityId: { before: null, after: opportunityId },
        assignedAgentId: { before: null, after: OTHER_AGENT_ID },
      },
    });
  });

  it('adds the request to the open opportunity about the same property', async () => {
    const { uow, inquiryId, assign } = await setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });
    const open = await seedOpportunity(uow, client);

    const output = unwrap(
      await assign.execute({ inquiryId, target: { kind: 'client', clientId: client.id } }, MANAGER),
    );

    expect(output).toMatchObject({ opportunityId: open.id, opportunityCreated: false });
    expect(uow.opportunities.rows.size).toBe(1);
    expect(uow.events.published.map((e) => e.type)).toContain('clients.opportunity_request_added');
  });

  it('reassigns the opportunity to the chosen agent, without changing the client agent', async () => {
    const { uow, inquiryId, assign } = await setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });

    const { opportunityId } = unwrap(
      await assign.execute(
        { inquiryId, target: { kind: 'client', clientId: client.id }, agentId: AGENT_ID },
        MANAGER,
      ),
    );

    expect(uow.opportunities.rows.get(opportunityId)).toMatchObject({
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
    });
    expect(uow.clients.rows.get(client.id)).toMatchObject({ agentId: OTHER_AGENT_ID });
    expect(uow.inquiries.rows.get(inquiryId)).toMatchObject({
      assignedAgentId: AGENT_ID,
      branchId: BRANCH_ID,
    });
    // La reasignación es lo que dispara la regla "al asignar".
    expect(uow.events.published.map((e) => e.type)).toContain('clients.opportunity_reassigned');
    expect(uow.audit.entries.map((e) => e.action)).toContain('opportunity.reassigned');
  });

  it('puts a client without an agent in charge of the one who assigns', async () => {
    const { uow, inquiryId, assign } = await setup();
    const client = await seedClient(uow, { agentId: undefined, branchId: undefined });

    unwrap(
      await assign.execute({ inquiryId, target: { kind: 'client', clientId: client.id } }, MANAGER),
    );

    expect(uow.clients.rows.get(client.id)).toMatchObject({
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
    });
    expect(uow.audit.entries.map((e) => e.action)).toContain('client.reassigned');
  });

  it('restores a matching client from the trash', async () => {
    const { uow, inquiryId, assign } = await setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, deleted: true });

    unwrap(
      await assign.execute({ inquiryId, target: { kind: 'client', clientId: client.id } }, MANAGER),
    );

    expect(uow.clients.rows.get(client.id)?.deletedAt).toBeUndefined();
    expect(uow.audit.entries.map((e) => e.action)).toContain('client.restored');
  });

  it('is not assigned to a client that does not share the phone or the email', async () => {
    const { uow, inquiryId, assign } = await setup();
    const other = await seedClient(uow, { phones: ['+5491155550000'] });

    const error = unwrapErr(
      await assign.execute({ inquiryId, target: { kind: 'client', clientId: other.id } }, MANAGER),
    );

    expect(error).toEqual({ type: 'InquiryClientMismatch' });
    expect(uow.inquiries.rows.get(inquiryId)?.status).toBe('pending');
  });
});

describe('AssignInquiry to a new client', () => {
  it('registers the client and puts the opportunity in charge of the one who assigns', async () => {
    const { uow, inquiryId, assign } = await setup();

    const output = unwrap(await assign.execute(toNew(inquiryId), MANAGER));

    expect(output).toMatchObject({ clientCreated: true, opportunityCreated: true });
    expect(uow.clients.rows.get(output.clientId)).toMatchObject({
      name: 'Ana Pérez',
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
    });
    expect(uow.opportunities.rows.get(output.opportunityId)).toMatchObject({
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
    });
    // Nace sin agente y pasa al elegido: corren "al crear" y "al asignar".
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'clients.client_registered',
      'clients.opportunity_created',
      'clients.opportunity_reassigned',
      'clients.inquiry_assigned',
    ]);
  });

  it('leaves it without an agent if the one who assigns is not an agent', async () => {
    const { uow, inquiryId, assign } = await setup();
    const admin = Actor.user(UNKNOWN_USER, ['inquiries:manage']);

    const { clientId, opportunityId } = unwrap(await assign.execute(toNew(inquiryId), admin));

    expect(uow.clients.rows.get(clientId)?.agentId).toBeUndefined();
    expect(uow.opportunities.rows.get(opportunityId)?.agentId).toBeUndefined();
    expect(uow.inquiries.rows.get(inquiryId)).toMatchObject({
      assignedAgentId: undefined,
      // Sin agente, conserva la sucursal de la propiedad.
      branchId: OTHER_BRANCH_ID,
    });
  });

  it('is not created when a client already has the phone or the email', async () => {
    const { uow, inquiryId, assign } = await setup();
    const existing = await seedClient(uow, {
      phones: ['+5491155550000'],
      emails: ['ana@example.com'],
    });

    const error = unwrapErr(await assign.execute(toNew(inquiryId), MANAGER));

    expect(error).toEqual({ type: 'DuplicateClient', clientId: existing.id, trashed: false });
    expect(uow.clients.rows.size).toBe(1);
    expect(uow.opportunities.rows.size).toBe(0);
  });

  it('suggests rent when the property is only for rent, and takes the chosen type', async () => {
    const rentOnly = await setup(['rent']);
    const { opportunityId } = unwrap(
      await rentOnly.assign.execute(toNew(rentOnly.inquiryId), MANAGER),
    );
    expect(rentOnly.uow.opportunities.rows.get(opportunityId)?.type).toBe('rent');

    const chosen = await setup(['rent']);
    const output = unwrap(
      await chosen.assign.execute(toNew(chosen.inquiryId, { type: 'appraisal' }), MANAGER),
    );
    expect(chosen.uow.opportunities.rows.get(output.opportunityId)?.type).toBe('appraisal');
  });
});

describe('AssignInquiry errors', () => {
  it('assigns an inquiry only once', async () => {
    const { uow, inquiryId, assign } = await setup();
    unwrap(await assign.execute(toNew(inquiryId), MANAGER));
    const client = [...uow.clients.rows.values()][0];

    const error = unwrapErr(
      await assign.execute(
        { inquiryId, target: { kind: 'client', clientId: client?.id ?? '' } },
        MANAGER,
      ),
    );

    expect(error).toEqual({ type: 'InquiryAlreadyAssigned' });
    expect(uow.clients.rows.size).toBe(1);
    expect(uow.opportunities.rows.size).toBe(1);
  });

  it('does not assign an inquiry in the trash', async () => {
    const { inquiryId, assign, deleteInquiry } = await setup();
    unwrap(await deleteInquiry.execute({ inquiryId }, MANAGER));

    expect(unwrapErr(await assign.execute(toNew(inquiryId), MANAGER))).toEqual({
      type: 'InquiryInTrash',
    });
  });

  it('reports an unknown inquiry or agent', async () => {
    const { inquiryId, assign } = await setup();

    expect(
      unwrapErr(await assign.execute(toNew('00000000-0000-7000-8000-0000000000ff'), MANAGER)),
    ).toEqual({ type: 'InquiryNotFound' });
    expect(
      unwrapErr(await assign.execute(toNew(inquiryId, { agentId: UNKNOWN_USER }), MANAGER)),
    ).toEqual({ type: 'AgentNotFound' });
  });

  it('rejects invalid input', async () => {
    const { assign } = await setup();

    const error = unwrapErr(await assign.execute(toNew('not-an-id'), MANAGER));

    expect(error.type).toBe('InvalidInput');
  });

  it('needs "Administrar consultas"', async () => {
    const { uow, inquiryId, assign } = await setup();

    expect(unwrapErr(await assign.execute(toNew(inquiryId), READER))).toEqual({
      type: 'Forbidden',
    });
    expect(uow.inquiries.rows.get(inquiryId)?.status).toBe('pending');
    expect(uow.audit.entries).toEqual([]);
  });
});
