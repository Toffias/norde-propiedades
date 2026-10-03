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
import { GetDevelopmentMap } from './get-development-map';
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
    const active = propertySnapshot({ developmentId: DEVELOPMENT_ID, status: 'available' });
    const reserved = propertySnapshot({
      id: '00000000-0000-7000-8000-0000000000c3',
      developmentId: DEVELOPMENT_ID,
      status: 'reserved',
    });
    const trashed = propertySnapshot({
      id: '00000000-0000-7000-8000-0000000000c2',
      developmentId: DEVELOPMENT_ID,
      deletedAt: TEST_NOW,
    });
    uow.properties.rows.set(active.id, active).set(reserved.id, reserved).set(trashed.id, trashed);
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
      unitCount: 2,
      availableUnitCount: 1,
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

describe('GetDevelopmentMap', () => {
  const AREA = { south: -34.7, west: -58.5, north: -34.5, east: -58.3 };

  it('passes the filters and the visible area, and says when there are more pins', async () => {
    const developments = new StubDevelopmentListQuery();
    const pin = {
      id: DEVELOPMENT_ID,
      code: 'EMP0001',
      name: 'Torre Gurruchaga',
      status: 'marketing' as const,
      publishAddress: 'Gurruchaga al 1800',
      unitCount: 4,
      latitude: -34.58,
      longitude: -58.43,
    };
    developments.pins = { items: [pin], total: 3 };
    const query = new GetDevelopmentMap({ developments });

    const result = unwrap(
      await query.execute({ ...AREA, q: 'torre', status: 'marketing' }, TEST_DEVELOPER),
    );

    expect(developments.mapCalls).toEqual([
      {
        criteria: {
          text: 'torre',
          status: 'marketing',
          developmentType: undefined,
          constructionStatus: undefined,
          tagId: undefined,
        },
        area: AREA,
        limit: 500,
      },
    ]);
    expect(result).toEqual({ pins: [pin], total: 3, truncated: true });
  });

  it('rejects an inverted area and needs developments:read', async () => {
    const query = new GetDevelopmentMap({ developments: new StubDevelopmentListQuery() });
    expect(unwrapErr(await query.execute({ ...AREA, north: -35 }, TEST_DEVELOPER))).toMatchObject({
      type: 'InvalidSearch',
    });
    expect(unwrapErr(await query.execute(AREA, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
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
      entry('a4', 'development.media_added', 6),
    ]);
    return new ListDevelopmentHistory({ uow, history, users });
  }

  it('pages the history newest first and filters by kind of change', async () => {
    const query = setup();
    const all = unwrap(await query.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPER));
    expect(all.items.map((item) => item.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
    expect(all.items[0]?.actor).toEqual({ id: PRODUCER_ID, name: 'Camila Ruiz' });
    const units = unwrap(
      await query.execute({ developmentId: DEVELOPMENT_ID, category: 'units' }, TEST_DEVELOPER),
    );
    expect(units.items.map((item) => item.id)).toEqual(['a2']);
    const media = unwrap(
      await query.execute({ developmentId: DEVELOPMENT_ID, category: 'media' }, TEST_DEVELOPER),
    );
    expect(media.items.map((item) => item.id)).toEqual(['a4']);
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
