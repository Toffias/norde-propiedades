import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  aPipelineItem,
  BRANCH_ID,
  closeReasonFixtureId,
  InMemoryClientAgents,
  InMemoryClientListings,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  PROPERTY_ID,
  seedClient,
  seedOpportunity,
  stageFixtureId,
  StubOpportunityPipelineQuery,
} from '../../testing';
import { CountOpportunitiesByStage } from '../queries/count-opportunities-by-stage';
import { CountPendingOpportunities } from '../queries/count-pending-opportunities';
import { ListOpportunities } from '../queries/list-opportunities';

import { ChangeOpportunityStage } from './change-opportunity-stage';
import { CloseOpportunity } from './close-opportunity';
import { ReassignOpportunity } from './reassign-opportunity';

const NEW = stageFixtureId(0);
const CONTACTED = stageFixtureId(1);
const NEGOTIATING = stageFixtureId(3);
const WON = stageFixtureId(4);
const LOST = stageFixtureId(5);
const POSITIVE = closeReasonFixtureId(0);
const NEGATIVE = closeReasonFixtureId(1);
const UNKNOWN_ID = '00000000-0000-7000-8000-0000000000ff';

/** Agente: ve y mueve sus oportunidades. */
const AGENT = Actor.user(AGENT_ID, ['opportunities:read', 'opportunities:update']).withBranch(
  BRANCH_ID,
);
/** Otro agente, de otra sucursal, con los mismos permisos. */
const OTHER_AGENT = Actor.user(OTHER_AGENT_ID, [
  'opportunities:read',
  'opportunities:update',
]).withBranch(OTHER_BRANCH_ID);
/** Gerente: todo sobre oportunidades. */
const MANAGER = Actor.user('00000000-0000-7000-8000-0000000000c3', [
  'opportunities:*',
  'properties:read',
  'clients:read-owners',
]);
const OUTSIDER = Actor.user('00000000-0000-7000-8000-0000000000c4', ['clients:read']);

async function setup(stageIndex = 0) {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  const ids = new SequentialIdGenerator();
  const client = await seedClient(uow);
  const opportunity = await seedOpportunity(uow, client, { stageIndex });
  return { uow, clock, ids, client, opportunity };
}

describe('ChangeOpportunityStage', () => {
  it('moves it to another stage, with history, activity, event and audit', async () => {
    const { uow, clock, ids, client, opportunity } = await setup();
    const useCase = new ChangeOpportunityStage({ uow, clock, ids });

    unwrap(await useCase.execute({ opportunityId: opportunity.id, stageId: CONTACTED }, AGENT));

    expect(uow.opportunities.rows.get(opportunity.id)).toMatchObject({
      stageId: CONTACTED,
      status: 'contacted',
      statusChangedAt: clock.now(),
    });
    expect(uow.opportunities.statusChanges).toMatchObject([
      { fromStageId: NEW, toStageId: CONTACTED, changedBy: AGENT_ID },
    ]);
    expect(uow.activities.of(client.id)).toMatchObject([
      {
        opportunityId: opportunity.id,
        actorId: AGENT_ID,
        body: { kind: 'status_change', from: 'new', to: 'contacted' },
      },
    ]);
    expect(uow.events.published.map((e) => e.type)).toEqual(['clients.opportunity_status_changed']);
    expect(uow.audit.entries).toHaveLength(1);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'opportunity.status_changed',
      entityType: 'opportunity',
      entityId: opportunity.id,
      clientIds: [client.id],
      changes: {
        stageId: { before: NEW, after: CONTACTED },
        status: { before: 'new', after: 'contacted' },
      },
    });
  });

  it('does nothing when it is already in that stage', async () => {
    const { uow, clock, ids, opportunity } = await setup();
    const useCase = new ChangeOpportunityStage({ uow, clock, ids });

    unwrap(await useCase.execute({ opportunityId: opportunity.id, stageId: NEW }, AGENT));

    expect(uow.audit.entries).toHaveLength(0);
    expect(uow.events.published).toHaveLength(0);
  });

  it('rejects a transition the domain does not allow', async () => {
    const { uow, clock, ids, opportunity } = await setup();
    const useCase = new ChangeOpportunityStage({ uow, clock, ids });

    expect(
      unwrapErr(
        await useCase.execute({ opportunityId: opportunity.id, stageId: NEGOTIATING }, AGENT),
      ),
    ).toEqual({ type: 'InvalidStatusTransition', from: 'new', to: 'negotiating' });
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('sends won and lost through closing', async () => {
    const { uow, clock, ids, opportunity } = await setup(2);
    const useCase = new ChangeOpportunityStage({ uow, clock, ids });

    expect(
      unwrapErr(await useCase.execute({ opportunityId: opportunity.id, stageId: WON }, AGENT)),
    ).toEqual({ type: 'CloseRequiresReason' });
  });

  it('reports a missing opportunity or stage, and invalid input', async () => {
    const { uow, clock, ids, opportunity } = await setup();
    const useCase = new ChangeOpportunityStage({ uow, clock, ids });

    expect(
      unwrapErr(await useCase.execute({ opportunityId: UNKNOWN_ID, stageId: CONTACTED }, AGENT)),
    ).toEqual({ type: 'OpportunityNotFound' });
    expect(
      unwrapErr(
        await useCase.execute({ opportunityId: opportunity.id, stageId: UNKNOWN_ID }, AGENT),
      ),
    ).toEqual({ type: 'StageNotFound' });
    expect(
      unwrapErr(await useCase.execute({ opportunityId: 'nope', stageId: CONTACTED }, AGENT)).type,
    ).toBe('InvalidInput');
  });

  it("needs update permission, and update-others for someone else's", async () => {
    const { uow, clock, ids, opportunity } = await setup();
    const useCase = new ChangeOpportunityStage({ uow, clock, ids });
    const input = { opportunityId: opportunity.id, stageId: CONTACTED };

    expect(unwrapErr(await useCase.execute(input, OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await useCase.execute(input, OTHER_AGENT))).toEqual({ type: 'Forbidden' });
    unwrap(await useCase.execute(input, MANAGER));
  });
});

describe('CloseOpportunity', () => {
  it('closes as won with a positive reason, in the first active won stage', async () => {
    const { uow, clock, ids, client, opportunity } = await setup(3);
    const useCase = new CloseOpportunity({ uow, clock, ids });

    unwrap(
      await useCase.execute({ opportunityId: opportunity.id, closeReasonId: POSITIVE }, AGENT),
    );

    expect(uow.opportunities.rows.get(opportunity.id)).toMatchObject({
      stageId: WON,
      status: 'won',
      closeReasonId: POSITIVE,
      closedAt: clock.now(),
    });
    expect(uow.activities.of(client.id)).toMatchObject([
      { body: { kind: 'status_change', from: 'negotiating', to: 'won' } },
    ]);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'opportunity.closed',
      clientIds: [client.id],
      changes: {
        status: { before: 'negotiating', after: 'won' },
        closeReasonId: { before: null, after: POSITIVE },
        closedAt: { before: null, after: clock.now().toISOString() },
      },
    });
  });

  it('closes as lost with a negative reason', async () => {
    const { uow, clock, ids, opportunity } = await setup();
    const useCase = new CloseOpportunity({ uow, clock, ids });

    unwrap(
      await useCase.execute({ opportunityId: opportunity.id, closeReasonId: NEGATIVE }, AGENT),
    );

    expect(uow.opportunities.rows.get(opportunity.id)).toMatchObject({
      stageId: LOST,
      status: 'lost',
    });
  });

  it('rejects a stage that does not match the reason, and closing twice', async () => {
    const { uow, clock, ids, opportunity } = await setup(3);
    const useCase = new CloseOpportunity({ uow, clock, ids });

    expect(
      unwrapErr(
        await useCase.execute(
          { opportunityId: opportunity.id, closeReasonId: POSITIVE, stageId: LOST },
          AGENT,
        ),
      ),
    ).toEqual({ type: 'CloseStageMismatch' });
    unwrap(
      await useCase.execute({ opportunityId: opportunity.id, closeReasonId: POSITIVE }, AGENT),
    );
    expect(
      unwrapErr(
        await useCase.execute({ opportunityId: opportunity.id, closeReasonId: NEGATIVE }, AGENT),
      ),
    ).toEqual({ type: 'OpportunityClosed' });
  });

  it('reports a missing reason or opportunity, and needs permission', async () => {
    const { uow, clock, ids, opportunity } = await setup();
    const useCase = new CloseOpportunity({ uow, clock, ids });

    expect(
      unwrapErr(
        await useCase.execute({ opportunityId: opportunity.id, closeReasonId: UNKNOWN_ID }, AGENT),
      ),
    ).toEqual({ type: 'CloseReasonNotFound' });
    expect(
      unwrapErr(
        await useCase.execute({ opportunityId: UNKNOWN_ID, closeReasonId: POSITIVE }, AGENT),
      ),
    ).toEqual({ type: 'OpportunityNotFound' });
    expect(
      unwrapErr(
        await useCase.execute({ opportunityId: opportunity.id, closeReasonId: POSITIVE }, OUTSIDER),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await useCase.execute(
          { opportunityId: opportunity.id, closeReasonId: POSITIVE },
          OTHER_AGENT,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('ReassignOpportunity', () => {
  const agents = new InMemoryClientAgents();

  it("moves it to another agent and their branch, without touching the contact's", async () => {
    const { uow, clock, client, opportunity } = await setup();
    const useCase = new ReassignOpportunity({ uow, clock, agents });

    unwrap(
      await useCase.execute({ opportunityId: opportunity.id, agentId: OTHER_AGENT_ID }, MANAGER),
    );

    expect(uow.opportunities.rows.get(opportunity.id)).toMatchObject({
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    expect(uow.clients.rows.get(client.id)).toMatchObject({ agentId: AGENT_ID });
    expect(uow.events.published).toMatchObject([
      {
        type: 'clients.opportunity_reassigned',
        payload: { fromAgentId: AGENT_ID, toAgentId: OTHER_AGENT_ID },
      },
    ]);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'opportunity.reassigned',
      clientIds: [client.id],
      changes: {
        agentId: { before: AGENT_ID, after: OTHER_AGENT_ID },
        branchId: { before: BRANCH_ID, after: OTHER_BRANCH_ID },
      },
    });
  });

  it('can leave it without an agent, and does nothing if nothing changes', async () => {
    const { uow, clock, opportunity } = await setup();
    const useCase = new ReassignOpportunity({ uow, clock, agents });

    unwrap(await useCase.execute({ opportunityId: opportunity.id, agentId: AGENT_ID }, MANAGER));
    expect(uow.audit.entries).toHaveLength(0);

    unwrap(await useCase.execute({ opportunityId: opportunity.id, agentId: null }, MANAGER));
    expect(uow.opportunities.rows.get(opportunity.id)).toMatchObject({
      agentId: undefined,
      branchId: undefined,
    });
  });

  it('rejects an unknown agent, a closed opportunity and a missing one', async () => {
    const { uow, clock, ids, opportunity } = await setup();
    const useCase = new ReassignOpportunity({ uow, clock, agents });

    expect(
      unwrapErr(
        await useCase.execute({ opportunityId: opportunity.id, agentId: UNKNOWN_ID }, MANAGER),
      ),
    ).toEqual({ type: 'AgentNotFound' });
    expect(
      unwrapErr(await useCase.execute({ opportunityId: UNKNOWN_ID, agentId: null }, MANAGER)),
    ).toEqual({ type: 'OpportunityNotFound' });

    unwrap(
      await new CloseOpportunity({ uow, clock, ids }).execute(
        { opportunityId: opportunity.id, closeReasonId: NEGATIVE },
        MANAGER,
      ),
    );
    expect(
      unwrapErr(
        await useCase.execute({ opportunityId: opportunity.id, agentId: OTHER_AGENT_ID }, MANAGER),
      ),
    ).toEqual({ type: 'OpportunityClosed' });
  });

  it('needs the reassign permission and to see the opportunity', async () => {
    const { uow, clock, opportunity } = await setup();
    const useCase = new ReassignOpportunity({ uow, clock, agents });
    const input = { opportunityId: opportunity.id, agentId: OTHER_AGENT_ID };
    const reassigner = Actor.user(OTHER_AGENT_ID, [
      'opportunities:read',
      'opportunities:reassign',
    ]).withBranch(OTHER_BRANCH_ID);

    expect(unwrapErr(await useCase.execute(input, AGENT))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await useCase.execute(input, reassigner))).toEqual({ type: 'Forbidden' });
  });
});

describe('ListOpportunities', () => {
  function list(items = [aPipelineItem()]) {
    const pipeline = new StubOpportunityPipelineQuery(items);
    const listings = new InMemoryClientListings();
    const useCase = new ListOpportunities({
      uow: new InMemoryClientsUnitOfWork(),
      pipeline,
      agents: new InMemoryClientAgents(),
      listings,
      clock: new FixedClock('2026-03-01T10:00:00Z'),
    });
    return { useCase, pipeline, listings };
  }

  it("lists a stage section with the actor's visibility, filters and paging", async () => {
    const { useCase, pipeline } = list();

    const page = unwrap(
      await useCase.execute(
        {
          stageId: NEW,
          q: 'ana',
          originChannel: 'zonaprop',
          createdFrom: '2026-02-01',
          sort: '-statusChangedAt',
          page: 2,
          pageSize: 10,
        },
        AGENT,
      ),
    );

    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 1 });
    expect(pipeline.searches[0]).toMatchObject({
      stageId: NEW,
      visibility: { kind: 'own', ownerId: AGENT_ID },
      text: 'ana',
      originChannel: 'zonaprop',
      created: { from: new Date('2026-02-01T03:00:00.000Z'), to: undefined },
      sort: { field: 'statusChangedAt', direction: 'desc' },
      offset: 10,
      limit: 10,
    });
  });

  it('maps rows: agent, visible property, days in stage and what the actor can do', async () => {
    const { useCase } = list();

    const [row] = unwrap(await useCase.execute({ stageId: NEW }, MANAGER)).items;

    expect(row).toMatchObject({
      agent: { id: AGENT_ID, name: 'Camila' },
      property: { id: PROPERTY_ID, code: 'NOR-001' },
      daysInStage: 4,
      open: true,
      client: { phone: '+5491166899124', contactMasked: false },
      // Desde "Nuevo": a Contactado, Visitando o Aplica a otra; solo se cierra como perdida.
      can: {
        update: true,
        reassign: true,
        moveTo: [stageFixtureId(1), stageFixtureId(2), stageFixtureId(6)],
        closeWith: [NEGATIVE],
      },
    });
  });

  it("masks owners' phones and closes the actions on closed or foreign rows", async () => {
    const { useCase } = list([
      aPipelineItem({ clientTypes: ['owner_seller'] }),
      aPipelineItem({ id: '00000000-0000-7000-8000-0000000000f3', status: 'won', stageId: WON }),
      aPipelineItem({ id: '00000000-0000-7000-8000-0000000000f4', agentId: OTHER_AGENT_ID }),
    ]);

    const rows = unwrap(await useCase.execute({ stageId: NEW }, AGENT)).items;

    expect(rows[0]?.client).toMatchObject({ contactMasked: true });
    expect(rows[0]?.client.phone).not.toBe('+5491166899124');
    expect(rows[0]?.property).toBeUndefined();
    expect(rows[1]).toMatchObject({
      open: false,
      can: { update: false, reassign: false, moveTo: [], closeWith: [] },
    });
    expect(rows[2]).toMatchObject({ can: { update: false, reassign: false, moveTo: [] } });
  });

  it('needs to see opportunities and validates the input', async () => {
    const { useCase } = list();

    expect(unwrapErr(await useCase.execute({ stageId: NEW }, OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await useCase.execute({ stageId: 'nope' }, AGENT)).type).toBe('InvalidInput');
  });
});

describe('CountOpportunitiesByStage', () => {
  it('counts with the same filters and visibility', async () => {
    const pipeline = new StubOpportunityPipelineQuery();
    pipeline.stageCounts = [{ stageId: NEW, count: 3 }];
    const useCase = new CountOpportunitiesByStage({ pipeline });

    expect(unwrap(await useCase.execute({ category: 'new' }, MANAGER))).toEqual([
      { stageId: NEW, count: 3 },
    ]);
    expect(pipeline.counts[0]).toMatchObject({ visibility: { kind: 'all' }, category: 'new' });
    expect(unwrapErr(await useCase.execute({}, OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await useCase.execute({ createdFrom: '2026-03-02', createdTo: '2026-03-01' }, MANAGER),
      ).type,
    ).toBe('InvalidInput');
  });
});

describe('CountPendingOpportunities', () => {
  it("counts the actor's new ones, and zero without permission", async () => {
    const pipeline = new StubOpportunityPipelineQuery();
    pipeline.pending = 5;
    const useCase = new CountPendingOpportunities({ pipeline });

    expect(unwrap(await useCase.execute(AGENT))).toBe(5);
    expect(pipeline.assigned).toEqual([{ agentId: AGENT_ID, categories: ['new'] }]);
    expect(unwrap(await useCase.execute(OUTSIDER))).toBe(0);
    expect(pipeline.assigned).toHaveLength(1);
  });
});
