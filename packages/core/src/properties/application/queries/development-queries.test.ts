import { describe, expect, it } from 'vitest';

import { InMemoryAuditHistoryQuery } from '../../../audit/testing';
import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  aDevelopmentItem,
  BRANCH_ID,
  DEVELOPMENT_ID,
  developmentSnapshot,
  InMemoryPropertiesUnitOfWork,
  InMemoryUserNames,
  OTHER_USER_ID,
  PRODUCER_ID,
  propertySnapshot,
  StubDevelopmentListQuery,
  StubPropertyDetailLookups,
  TEST_DEVELOPER,
  TEST_DEVELOPMENTS_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { GetDevelopmentDetail } from './get-development-detail';
import { ListDevelopmentHistory } from './list-development-history';
import { ListDevelopments } from './list-developments';

const CLIENT = '00000000-0000-7000-8000-0000000000f3';
const users = new InMemoryUserNames(
  new Map([
    [PRODUCER_ID, 'Camila Ruiz'],
    [OTHER_USER_ID, 'Martín Gómez'],
  ]),
);

describe('ListDevelopments', () => {
  it('passes the filters, sort and page to the query and resolves who deleted', async () => {
    const developments = new StubDevelopmentListQuery({
      items: [aDevelopmentItem({ deletedAt: TEST_NOW, deletedBy: OTHER_USER_ID })],
      total: 26,
    });
    const query = new ListDevelopments({ developments, users });

    const page = unwrap(
      await query.execute(
        {
          q: 'torre',
          status: 'marketing',
          developmentType: 'building',
          sort: '-deliveryDate',
          page: 2,
          pageSize: 25,
          view: 'trash',
        },
        TEST_DEVELOPMENTS_MANAGER,
      ),
    );

    expect(developments.calls).toEqual([
      {
        view: 'trash',
        text: 'torre',
        status: 'marketing',
        developmentType: 'building',
        constructionStatus: undefined,
        tagId: undefined,
        sort: { field: 'deliveryDate', direction: 'desc' },
        offset: 25,
        limit: 25,
      },
    ]);
    expect(page).toMatchObject({ total: 26, page: 2, pageSize: 25 });
    expect(page.items[0]?.deletedBy).toEqual({ id: OTHER_USER_ID, name: 'Martín Gómez' });
  });

  it('rejects an invalid sort and needs developments:read; the trash needs delete', async () => {
    const query = new ListDevelopments({ developments: new StubDevelopmentListQuery(), users });
    expect(unwrapErr(await query.execute({ sort: 'price' }, TEST_DEVELOPER)).type).toBe(
      'InvalidSearch',
    );
    expect(unwrapErr(await query.execute({}, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await query.execute({ view: 'trash' }, TEST_DEVELOPER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('GetDevelopmentDetail', () => {
  it('builds the record with names, catalogs and the active units', async () => {
    const uow = new InMemoryPropertiesUnitOfWork();
    const snapshot = developmentSnapshot({
      locationId: 'loc-1',
      featureIds: ['f1'],
      tagIds: ['t1'],
      commercialContactClientId: CLIENT,
    });
    uow.developments.rows.set(snapshot.id, snapshot);
    const active = propertySnapshot({ developmentId: DEVELOPMENT_ID });
    const trashed = propertySnapshot({
      id: '00000000-0000-7000-8000-0000000000c2',
      developmentId: DEVELOPMENT_ID,
      deletedAt: TEST_NOW,
    });
    uow.properties.rows.set(active.id, active).set(trashed.id, trashed);
    const lookups = new StubPropertyDetailLookups();
    lookups.clients_.set(CLIENT, 'Ana Pérez');

    const detail = unwrap(
      await new GetDevelopmentDetail({ uow, lookups, users }).execute(
        { developmentId: DEVELOPMENT_ID },
        TEST_DEVELOPER,
      ),
    );

    expect(detail).toMatchObject({
      name: 'Torre Gurruchaga',
      locationPath: [{ id: 'loc-1', name: 'Palermo' }],
      features: [{ id: 'f1' }],
      tags: [{ id: 't1' }],
      commercialContact: { id: CLIENT, name: 'Ana Pérez' },
      producer: { id: PRODUCER_ID, name: 'Camila Ruiz' },
      unitCount: 1,
    });
  });

  it('reports a missing development and needs developments:read', async () => {
    const query = new GetDevelopmentDetail({
      uow: new InMemoryPropertiesUnitOfWork(),
      lookups: new StubPropertyDetailLookups(),
      users,
    });
    expect(
      unwrapErr(await query.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPER)),
    ).toEqual({ type: 'DevelopmentNotFound' });
    expect(
      unwrapErr(await query.execute({ developmentId: DEVELOPMENT_ID }, TEST_OUTSIDER)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('ListDevelopmentHistory', () => {
  function setup() {
    const uow = new InMemoryPropertiesUnitOfWork();
    const snapshot = developmentSnapshot();
    uow.developments.rows.set(snapshot.id, snapshot);
    const entry = (id: string, action: string, day: number) => ({
      id,
      entityType: 'development',
      entityId: DEVELOPMENT_ID,
      occurredAt: new Date(Date.UTC(2026, 8, day, 15)),
      actorId: PRODUCER_ID,
      source: 'gestion',
      action,
      changes: {},
    });
    const history = new InMemoryAuditHistoryQuery([
      entry('a1', 'development.created', 1),
      entry('a2', 'development.unit_added', 3),
      entry('a3', 'development.status_changed', 5),
    ]);
    return new ListDevelopmentHistory({ uow, history, users });
  }

  it('pages the history newest first and filters by kind of change', async () => {
    const query = setup();
    const all = unwrap(await query.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPER));
    expect(all.items.map((item) => item.id)).toEqual(['a3', 'a2', 'a1']);
    expect(all.items[0]?.actor).toEqual({ id: PRODUCER_ID, name: 'Camila Ruiz' });
    const units = unwrap(
      await query.execute({ developmentId: DEVELOPMENT_ID, category: 'units' }, TEST_DEVELOPER),
    );
    expect(units.items.map((item) => item.id)).toEqual(['a2']);
  });

  it('shows the history of others only with "ver el historial de otros"', async () => {
    const query = setup();
    const ownAudit = Actor.user(OTHER_USER_ID, ['developments:read', 'audit:read']).withBranch(
      BRANCH_ID,
    );
    expect(unwrapErr(await query.execute({ developmentId: DEVELOPMENT_ID }, ownAudit))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await query.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPMENTS_MANAGER));
    expect(
      unwrapErr(
        await query.execute(
          { developmentId: DEVELOPMENT_ID },
          Actor.user(PRODUCER_ID, ['developments:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});
