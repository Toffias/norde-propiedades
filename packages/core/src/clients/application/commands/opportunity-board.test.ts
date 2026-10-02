import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  closeReasonFixtureId,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  seedOpportunity,
  stageFixtureId,
  StubClientRecordQuery,
} from '../../testing';
import { GetOpportunityConfiguration } from '../queries/get-opportunity-configuration';
import { ListOpportunityHistory } from '../queries/list-opportunity-history';

import { AddClientNote } from './add-client-note';
import { ChangeOpportunityStage } from './change-opportunity-stage';

const NEW = stageFixtureId(0);
const CONTACTED = stageFixtureId(1);
const UNKNOWN_ID = '00000000-0000-7000-8000-0000000000ff';

/** Agente: ve y mueve sus oportunidades; no edita contactos de otros. */
const AGENT = Actor.user(AGENT_ID, [
  'opportunities:read',
  'opportunities:update',
  'clients:read',
  'clients:update',
]).withBranch(BRANCH_ID);
/** Otro agente, de otra sucursal, con los mismos permisos. */
const OTHER_AGENT = Actor.user(OTHER_AGENT_ID, [
  'opportunities:read',
  'opportunities:update',
  'clients:read',
  'clients:update',
]).withBranch(OTHER_BRANCH_ID);
/** Solo mira las oportunidades: no les escribe notas. */
const VIEWER = Actor.user(AGENT_ID, ['opportunities:read']).withBranch(BRANCH_ID);
const OUTSIDER = Actor.user('00000000-0000-7000-8000-0000000000c4', ['clients:read']);

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const ids = new SequentialIdGenerator();
  // El contacto es de otro agente; la oportunidad, del agente.
  const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });
  const opportunity = await seedOpportunity(uow, client, {
    agentId: AGENT_ID,
    branchId: BRANCH_ID,
  });
  return { uow, clock, ids, client, opportunity };
}

describe('AddClientNote on an opportunity', () => {
  it('lets whoever works the opportunity write it, tied to it, with audit', async () => {
    const { uow, clock, ids, client, opportunity } = await setup();
    const useCase = new AddClientNote({ uow, ids, clock });

    unwrap(
      await useCase.execute(
        { clientId: client.id, opportunityId: opportunity.id, text: '  Llamar el lunes ' },
        AGENT,
      ),
    );

    expect(uow.activities.of(client.id)).toMatchObject([
      {
        opportunityId: opportunity.id,
        actorId: AGENT_ID,
        body: { kind: 'note', text: 'Llamar el lunes' },
      },
    ]);
    expect(uow.audit.entries).toHaveLength(1);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'client.note_added',
      entityId: client.id,
      changes: {
        note: { before: null, after: 'Llamar el lunes' },
        opportunityId: { before: null, after: opportunity.id },
      },
    });
  });

  it('still needs the contact for a note without opportunity', async () => {
    const { uow, clock, ids, client } = await setup();
    const useCase = new AddClientNote({ uow, ids, clock });

    expect(unwrapErr(await useCase.execute({ clientId: client.id, text: 'Hola' }, AGENT))).toEqual({
      type: 'Forbidden',
    });
  });

  it('rejects someone who cannot update the opportunity', async () => {
    const { uow, clock, ids, client, opportunity } = await setup();
    const useCase = new AddClientNote({ uow, ids, clock });
    const input = { clientId: client.id, opportunityId: opportunity.id, text: 'Hola' };

    // Es el agente del contacto, pero la oportunidad es de otro.
    expect(unwrapErr(await useCase.execute(input, OTHER_AGENT))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await useCase.execute(input, VIEWER))).toEqual({ type: 'Forbidden' });
    expect(uow.activities.of(client.id)).toHaveLength(0);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('reports an opportunity that is missing or belongs to another contact', async () => {
    const { uow, clock, ids, client } = await setup();
    const other = await seedClient(uow);
    const othersOpportunity = await seedOpportunity(uow, other);
    const useCase = new AddClientNote({ uow, ids, clock });

    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: client.id, opportunityId: othersOpportunity.id, text: 'Hola' },
          AGENT,
        ),
      ),
    ).toEqual({ type: 'OpportunityNotFound' });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: client.id, opportunityId: UNKNOWN_ID, text: 'Hola' },
          AGENT,
        ),
      ),
    ).toEqual({ type: 'OpportunityNotFound' });
  });
});

describe('ChangeOpportunityStage activity', () => {
  it('records the editable stages it moved between', async () => {
    const { uow, clock, ids, client, opportunity } = await setup();

    unwrap(
      await new ChangeOpportunityStage({ uow, clock, ids }).execute(
        { opportunityId: opportunity.id, stageId: CONTACTED },
        AGENT,
      ),
    );

    expect(uow.activities.of(client.id)[0]?.body).toEqual({
      kind: 'status_change',
      from: 'new',
      to: 'contacted',
      fromStageId: NEW,
      toStageId: CONTACTED,
    });
  });
});

describe('ListOpportunityHistory', () => {
  async function historySetup() {
    const base = await setup();
    const records = new StubClientRecordQuery();
    const agents = new InMemoryClientAgents();
    const useCase = new ListOpportunityHistory({ uow: base.uow, records, agents });
    return { ...base, records, useCase };
  }

  it('pages the activity tied to the opportunity, with actors and stage names', async () => {
    const { opportunity, records, useCase } = await historySetup();
    records.activityItems = [
      {
        id: 'a2',
        opportunityId: opportunity.id,
        actorId: AGENT_ID,
        occurredAt: new Date('2026-03-01T10:00:00Z'),
        body: {
          kind: 'status_change',
          from: 'new',
          to: 'contacted',
          fromStageId: NEW,
          toStageId: CONTACTED,
        },
      },
      {
        id: 'a1',
        opportunityId: opportunity.id,
        actorId: 'system:agent-ia',
        occurredAt: new Date('2026-02-28T10:00:00Z'),
        body: { kind: 'note', text: 'Pidió visita' },
      },
    ];

    const page = unwrap(
      await useCase.execute(
        { opportunityId: opportunity.id, kind: 'status_change', page: 2, pageSize: 10 },
        AGENT,
      ),
    );

    expect(records.historyCriteria).toEqual([
      {
        opportunityId: opportunity.id,
        kind: 'status_change',
        direction: 'desc',
        offset: 10,
        limit: 10,
      },
    ]);
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 10 });
    expect(page.items[0]).toMatchObject({
      kind: 'status_change',
      actor: { kind: 'user', id: AGENT_ID, name: 'Camila' },
      fromStage: { id: NEW, name: 'Nuevo' },
      toStage: { id: CONTACTED, name: 'Contactado' },
    });
    expect(page.items[0]).not.toHaveProperty('toStageId');
    expect(page.items[1]).toMatchObject({ kind: 'note', actor: { kind: 'agent' } });
  });

  it('only shows opportunities the actor can see', async () => {
    const { opportunity, useCase } = await historySetup();

    expect(
      unwrapErr(await useCase.execute({ opportunityId: opportunity.id }, OTHER_AGENT)),
    ).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await useCase.execute({ opportunityId: opportunity.id }, OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('reports a missing opportunity and invalid input', async () => {
    const { useCase } = await historySetup();

    expect(unwrapErr(await useCase.execute({ opportunityId: UNKNOWN_ID }, AGENT))).toEqual({
      type: 'OpportunityNotFound',
    });
    expect(unwrapErr(await useCase.execute({ opportunityId: 'nope' }, AGENT)).type).toBe(
      'InvalidInput',
    );
  });
});

describe('GetOpportunityConfiguration close reasons', () => {
  it('says which category each reason closes in', async () => {
    const { uow } = await setup();
    const config = unwrap(
      await new GetOpportunityConfiguration({ uow }).execute(
        Actor.user(AGENT_ID, ['opportunities:read']),
      ),
    );

    const closesAs = new Map(config.closeReasons.map((reason) => [reason.id, reason.closesAs]));
    expect(closesAs.get(closeReasonFixtureId(0))).toBe('won');
    expect(closesAs.get(closeReasonFixtureId(1))).toBe('lost');
  });
});
