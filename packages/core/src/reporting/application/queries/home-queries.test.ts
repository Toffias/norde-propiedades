import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import { InMemoryReportingUserNames, StubHomeDashboardQuery } from '../../testing';
import { homeScope } from '../home-scope';
import { GetPendingOpportunities } from './get-pending-opportunities';
import { GetPortfolioSummary } from './get-portfolio-summary';
import { GetUnassignedInquiries } from './get-unassigned-inquiries';
import { GetUpcomingSignings } from './get-upcoming-signings';
import { ListAvailableDevelopments } from './list-available-developments';
import { ListAvailableProperties } from './list-available-properties';

const AGENT_ID = '00000000-0000-7000-8000-0000000000a1';
const OTHER_AGENT_ID = '00000000-0000-7000-8000-0000000000a2';
const BRANCH_ID = '00000000-0000-7000-8000-0000000000b1';
const CLIENT_ID = '00000000-0000-7000-8000-0000000000c1';
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000d1';

const AGENT = Actor.user(AGENT_ID, [
  'opportunities:read',
  'inquiries:read',
  'reservations:read',
  'properties:read',
  'developments:read',
]).withBranch(BRANCH_ID);
const MANAGER = Actor.user(OTHER_AGENT_ID, ['opportunities:read-branch']).withBranch(BRANCH_ID);
const ADMIN = Actor.user(OTHER_AGENT_ID, [
  'opportunities:*',
  'inquiries:*',
  'reservations:*',
  'properties:*',
  'developments:*',
]);
const NOBODY = Actor.user(AGENT_ID, []);

const users = () => new InMemoryReportingUserNames({ [AGENT_ID]: 'Camila Pérez' });

describe('homeScope', () => {
  it('uses the reach of the opportunities and keeps the filters', () => {
    expect(homeScope(ADMIN, { agentId: AGENT_ID })).toEqual({
      visibility: { kind: 'all' },
      agentId: AGENT_ID,
      branchId: undefined,
    });
    expect(homeScope(MANAGER, {}).visibility).toEqual({
      kind: 'branch',
      ownerId: OTHER_AGENT_ID,
      branchId: BRANCH_ID,
    });
    expect(homeScope(AGENT, { branchId: BRANCH_ID }).visibility).toEqual({
      kind: 'own',
      ownerId: AGENT_ID,
    });
  });

  it('falls back to their own without the permission or without a branch', () => {
    expect(homeScope(NOBODY, {}).visibility).toEqual({ kind: 'own', ownerId: AGENT_ID });
    const manager = Actor.user(OTHER_AGENT_ID, ['opportunities:read-branch']);
    expect(homeScope(manager, {}).visibility).toEqual({ kind: 'own', ownerId: OTHER_AGENT_ID });
  });
});

describe('GetUnassignedInquiries', () => {
  it('lists the oldest pending inquiries with their limit, filtered by branch', async () => {
    const home = new StubHomeDashboardQuery();
    home.inquiries = {
      total: 8,
      items: [
        {
          id: 'i1',
          channel: 'zonaprop',
          receivedAt: new Date('2026-09-30T10:00:00Z'),
          senderName: 'Juan',
          propertyId: PROPERTY_ID,
          propertyCode: 'NOR123',
          developmentId: undefined,
          developmentName: undefined,
        },
      ],
    };
    const widget = unwrap(
      await new GetUnassignedInquiries({ home }).execute({ branchId: BRANCH_ID }, AGENT),
    );
    expect(widget.total).toBe(8);
    expect(widget.items).toHaveLength(1);
    expect(home.calls[0]?.args).toEqual([{ branchId: BRANCH_ID }, 5]);
  });

  it('requires reading inquiries', async () => {
    const home = new StubHomeDashboardQuery();
    const error = unwrapErr(await new GetUnassignedInquiries({ home }).execute({}, NOBODY));
    expect(error).toEqual({ type: 'Forbidden' });
    expect(home.calls).toHaveLength(0);
  });

  it('rejects an invalid filter', async () => {
    const home = new StubHomeDashboardQuery();
    const error = unwrapErr(
      await new GetUnassignedInquiries({ home }).execute({ branchId: 'central' }, AGENT),
    );
    expect(error.type).toBe('InvalidInput');
  });
});

describe('GetPendingOpportunities', () => {
  it("lists an agent's new opportunities with the agent's name", async () => {
    const home = new StubHomeDashboardQuery();
    home.opportunities = {
      total: 1,
      items: [
        {
          id: 'o1',
          clientId: CLIENT_ID,
          clientName: 'Ana',
          stageName: 'Nuevo',
          stageColor: '#2563eb',
          originChannel: 'whatsapp',
          agentId: AGENT_ID,
          waitingSince: new Date('2026-09-29T12:00:00Z'),
        },
      ],
    };
    const widget = unwrap(
      await new GetPendingOpportunities({ home, users: users() }).execute({}, AGENT),
    );
    expect(widget.items[0]?.agent).toEqual({ id: AGENT_ID, name: 'Camila Pérez' });
    expect(home.calls[0]).toEqual({
      method: 'opportunitiesInCategories',
      scope: {
        visibility: { kind: 'own', ownerId: AGENT_ID },
        agentId: undefined,
        branchId: undefined,
      },
      args: [['new'], 5],
    });
  });

  it('applies the filters inside the reach of whoever looks', async () => {
    const home = new StubHomeDashboardQuery();
    await new GetPendingOpportunities({ home, users: users() }).execute(
      { agentId: OTHER_AGENT_ID },
      AGENT,
    );
    // Un agente que filtra por otro agente sigue limitado a lo suyo: la query no devuelve nada.
    expect(home.calls[0]?.scope).toEqual({
      visibility: { kind: 'own', ownerId: AGENT_ID },
      agentId: OTHER_AGENT_ID,
      branchId: undefined,
    });
  });

  it('requires reading opportunities', async () => {
    const home = new StubHomeDashboardQuery();
    const error = unwrapErr(
      await new GetPendingOpportunities({ home, users: users() }).execute({}, NOBODY),
    );
    expect(error).toEqual({ type: 'Forbidden' });
  });
});

describe('GetUpcomingSignings', () => {
  const clock = new FixedClock(new Date('2026-10-01T12:00:00Z'));
  const signing = (id: string, estimatedSigningDate: string) => ({
    id,
    propertyId: PROPERTY_ID,
    propertyCode: 'NOR123',
    propertyTitle: 'Departamento en Palermo',
    clientId: CLIENT_ID,
    clientName: 'Ana',
    agentId: AGENT_ID,
    estimatedSigningDate,
  });

  it('asks for the next 30 days and flags the overdue ones', async () => {
    const home = new StubHomeDashboardQuery();
    home.signings = {
      total: 2,
      items: [signing('r1', '2026-09-28'), signing('r2', '2026-10-01')],
    };
    const widget = unwrap(
      await new GetUpcomingSignings({ home, users: users(), clock }).execute({}, AGENT),
    );
    expect(home.calls[0]?.args).toEqual(['2026-10-31', 5]);
    expect(widget.items.map((row) => row.overdue)).toEqual([true, false]);
    expect(widget.items[0]?.agent?.name).toBe('Camila Pérez');
  });

  it('requires reading reservations and properties', async () => {
    const home = new StubHomeDashboardQuery();
    const onlyProperties = Actor.user(AGENT_ID, ['properties:read']);
    const error = unwrapErr(
      await new GetUpcomingSignings({ home, users: users(), clock }).execute({}, onlyProperties),
    );
    expect(error).toEqual({ type: 'Forbidden' });
  });
});

describe('GetPortfolioSummary', () => {
  it('counts the open opportunities and computes each channel share', async () => {
    const home = new StubHomeDashboardQuery();
    home.clients = 4;
    home.channels = [
      { channel: 'whatsapp', count: 2 },
      { channel: 'zonaprop', count: 1 },
      { channel: undefined, count: 0 },
    ];
    home.statuses = [{ status: 'available', count: 12 }];
    home.developmentCount = 3;
    const summary = unwrap(await new GetPortfolioSummary({ home }).execute({}, ADMIN));
    expect(summary.clientsWithOpenOpportunity).toBe(4);
    expect(summary.openOpportunitiesByChannel?.map((row) => row.share)).toEqual([66.7, 33.3, 0]);
    expect(summary.propertiesByStatus).toEqual([{ status: 'available', count: 12 }]);
    expect(summary.availableDevelopments).toBe(3);
    const open = home.calls.find((call) => call.method === 'clientsWithOpportunitiesIn');
    expect(open?.args).toEqual([
      ['new', 'contacted', 'visiting', 'negotiating', 'referred_to_partner'],
    ]);
  });

  it('leaves out the parts whose module they cannot read', async () => {
    const home = new StubHomeDashboardQuery();
    const summary = unwrap(await new GetPortfolioSummary({ home }).execute({}, NOBODY));
    expect(summary).toEqual({
      clientsWithOpenOpportunity: undefined,
      openOpportunitiesByChannel: undefined,
      openOpportunitiesByStage: undefined,
      propertiesByStatus: undefined,
      availableDevelopments: undefined,
    });
    expect(home.calls).toHaveLength(0);
  });

  it('passes the scope of a branch manager to every count', async () => {
    const home = new StubHomeDashboardQuery();
    await new GetPortfolioSummary({ home }).execute({ agentId: AGENT_ID }, MANAGER);
    expect(home.calls.map((call) => call.scope?.visibility.kind)).toEqual([
      'branch',
      'branch',
      'branch',
    ]);
  });
});

describe('ListAvailableProperties and ListAvailableDevelopments', () => {
  it('paginate in the query with the reach of whoever looks', async () => {
    const home = new StubHomeDashboardQuery();
    home.properties = {
      total: 23,
      items: [
        {
          id: PROPERTY_ID,
          code: 'NOR123',
          propertyType: 'apartment',
          title: 'Departamento en Palermo',
          neighborhood: 'Palermo',
          operations: [],
          agentId: undefined,
          updatedAt: new Date('2026-09-30T12:00:00Z'),
        },
      ],
    };
    const page = unwrap(
      await new ListAvailableProperties({ home, users: users() }).execute(
        { page: 3, pageSize: 10 },
        AGENT,
      ),
    );
    expect(page).toMatchObject({ total: 23, page: 3, pageSize: 10 });
    expect(page.items[0]?.agent).toBeUndefined();
    expect(home.calls[0]).toEqual({
      method: 'availableProperties',
      scope: {
        visibility: { kind: 'own', ownerId: AGENT_ID },
        agentId: undefined,
        branchId: undefined,
      },
      args: [{ sort: { field: 'updatedAt', direction: 'desc' }, offset: 20, limit: 10 }],
    });

    await new ListAvailableDevelopments({ home, users: users() }).execute(
      { sort: 'code', branchId: BRANCH_ID },
      ADMIN,
    );
    expect(home.calls[1]?.scope).toEqual({
      visibility: { kind: 'all' },
      agentId: undefined,
      branchId: BRANCH_ID,
    });
    expect(home.calls[1]?.args).toEqual([
      { sort: { field: 'code', direction: 'asc' }, offset: 0, limit: 25 },
    ]);
  });

  it('require reading properties or developments and a valid page', async () => {
    const home = new StubHomeDashboardQuery();
    expect(
      unwrapErr(await new ListAvailableProperties({ home, users: users() }).execute({}, NOBODY)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await new ListAvailableDevelopments({ home, users: users() }).execute({}, NOBODY)),
    ).toEqual({ type: 'Forbidden' });
    const error = unwrapErr(
      await new ListAvailableProperties({ home, users: users() }).execute({ pageSize: 500 }, AGENT),
    );
    expect(error.type).toBe('InvalidInput');
  });
});
