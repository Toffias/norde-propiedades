import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import { MAX_RESERVATION_EXPORT_ROWS } from '../../contracts';
import { ExportReservations } from '../commands/export-reservations';
import type { ReservationSearchItem } from '../ports/reservation-list-query';
import {
  BRANCH_ID,
  CLIENT_ID,
  FakeReservationExportWriter,
  InMemoryPropertiesUnitOfWork,
  InMemoryUserNames,
  MANAGER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  StubReservationListQuery,
  TEST_OUTSIDER,
  TEST_RESERVATIONS_MANAGER,
  TEST_RESERVING_AGENT,
} from '../../testing';
import { ListReservations } from './list-reservations';

function aRow(overrides: Partial<ReservationSearchItem> = {}): ReservationSearchItem {
  return {
    id: '00000000-0000-7000-8000-0000000000f1',
    propertyId: PROPERTY_ID,
    property: { id: PROPERTY_ID, code: 'P-001', propertyType: 'apartment', address: 'Güemes 123' },
    client: { id: CLIENT_ID, name: 'Lucía Pérez' },
    opportunityId: undefined,
    agentUserId: PRODUCER_ID,
    managerUserId: MANAGER_USER_ID,
    operation: 'sale',
    amount: { amountCents: 500_000_00n, currency: 'USD' },
    commissionPct: 3,
    commission: undefined,
    status: 'active',
    reservedAt: new Date('2026-09-20T12:00:00Z'),
    estimatedSigningDate: '2026-11-15',
    fallenAt: undefined,
    fallenReason: undefined,
    signedAt: undefined,
    notes: undefined,
    ...overrides,
  };
}

const users = new InMemoryUserNames(
  new Map([
    [PRODUCER_ID, 'Camila Ríos'],
    [MANAGER_USER_ID, 'Martín Gómez'],
  ]),
);
const EMPTY_CRITERIA = {
  status: undefined,
  operation: undefined,
  propertyType: undefined,
  agentUserId: undefined,
  managerUserId: undefined,
  branchId: undefined,
  reserved: { from: undefined, to: undefined },
  signing: { from: undefined, to: undefined },
};

describe('ListReservations', () => {
  it('pages all reservations in the database, with the user names', async () => {
    const reservations = new StubReservationListQuery([
      aRow(),
      aRow({ id: '00000000-0000-7000-8000-0000000000f2' }),
    ]);
    const page = unwrap(
      await new ListReservations({ reservations, users }).execute(
        { page: 2, pageSize: 1 },
        TEST_RESERVING_AGENT,
      ),
    );

    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(page.items).toEqual([
      expect.objectContaining({
        id: '00000000-0000-7000-8000-0000000000f2',
        property: expect.objectContaining({ code: 'P-001' }) as unknown,
        agent: { id: PRODUCER_ID, name: 'Camila Ríos' },
        manager: { id: MANAGER_USER_ID, name: 'Martín Gómez' },
      }),
    ]);
    expect(page.items[0]).not.toHaveProperty('agentUserId');
    expect(reservations.requests).toEqual([
      { ...EMPTY_CRITERIA, sort: { field: 'reservedAt', direction: 'desc' }, offset: 1, limit: 1 },
    ]);
  });

  it('turns the filters into criteria, with the dates of Buenos Aires', async () => {
    const reservations = new StubReservationListQuery();
    unwrap(
      await new ListReservations({ reservations, users }).execute(
        {
          status: 'active',
          operation: 'rent',
          propertyType: 'house',
          agentId: PRODUCER_ID,
          managerId: MANAGER_USER_ID,
          branchId: BRANCH_ID,
          reservedFrom: '2026-09-01',
          reservedTo: '2026-09-30',
          signingFrom: '2026-10-01',
          signingTo: '2026-12-31',
          sort: '-estimatedSigningDate',
        },
        TEST_RESERVING_AGENT,
      ),
    );

    expect(reservations.requests[0]).toEqual({
      status: 'active',
      operation: 'rent',
      propertyType: 'house',
      agentUserId: PRODUCER_ID,
      managerUserId: MANAGER_USER_ID,
      branchId: BRANCH_ID,
      reserved: {
        from: new Date('2026-09-01T03:00:00.000Z'),
        to: new Date('2026-10-01T03:00:00.000Z'),
      },
      signing: { from: '2026-10-01', to: '2026-12-31' },
      sort: { field: 'estimatedSigningDate', direction: 'desc' },
      offset: 0,
      limit: expect.any(Number) as unknown,
    });
  });

  it('rejects invalid filters and actors without the permission', async () => {
    const list = new ListReservations({ reservations: new StubReservationListQuery(), users });

    expect(
      unwrapErr(
        await list.execute(
          { reservedFrom: '2026-10-01', reservedTo: '2026-09-01' },
          TEST_RESERVING_AGENT,
        ),
      ),
    ).toMatchObject({ type: 'InvalidInput' });
    expect(unwrapErr(await list.execute({ sort: 'client' }, TEST_RESERVING_AGENT))).toMatchObject({
      type: 'InvalidInput',
    });
    expect(unwrapErr(await list.execute({}, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});

describe('ExportReservations', () => {
  function exporter(rows: readonly ReservationSearchItem[] = [aRow()]) {
    const uow = new InMemoryPropertiesUnitOfWork();
    const reservations = new StubReservationListQuery(rows);
    const writer = new FakeReservationExportWriter();
    const use = new ExportReservations({
      uow,
      reservations,
      users,
      writer,
      clock: new FixedClock('2026-10-04T15:00:00Z'),
    });
    return { uow, reservations, writer, use };
  }

  it('writes the filtered reservations in batches and audits the export', async () => {
    const { use, uow, reservations, writer } = exporter();

    const file = unwrap(
      await use.execute({ filter: { status: 'active' } }, TEST_RESERVATIONS_MANAGER),
    );
    for await (const _chunk of file.body) {
      // La planilla se arma a medida que se lee.
    }

    expect(reservations.counts).toEqual([{ ...EMPTY_CRITERIA, status: 'active' }]);
    expect(reservations.requests[0]).toMatchObject({
      status: 'active',
      sort: { field: 'reservedAt', direction: 'asc' },
      offset: 0,
      limit: 1,
    });
    expect(writer.rows).toEqual([
      expect.objectContaining({ agent: { id: PRODUCER_ID, name: 'Camila Ríos' } }),
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'reservation.exported',
        entityType: 'reservation_export',
        entityId: 'xlsx',
        clientIds: [],
        changes: {
          count: { before: null, after: 1 },
          filter: { before: null, after: { status: 'active' } },
        },
      }),
    ]);
  });

  it('says when there is nothing to export', async () => {
    const { use, uow } = exporter([]);
    expect(unwrapErr(await use.execute({}, TEST_RESERVATIONS_MANAGER))).toEqual({
      type: 'NothingToExport',
    });
    expect(uow.audit.entries).toEqual([]);
  });

  it('refuses more rows than the cap', async () => {
    const { use, reservations } = exporter();
    reservations.count = () => Promise.resolve(MAX_RESERVATION_EXPORT_ROWS + 1);
    expect(unwrapErr(await use.execute({}, TEST_RESERVATIONS_MANAGER))).toEqual({
      type: 'TooManyToExport',
      max: MAX_RESERVATION_EXPORT_ROWS,
      total: MAX_RESERVATION_EXPORT_ROWS + 1,
    });
  });

  it('asks for the export permission', async () => {
    const { use } = exporter();
    expect(unwrapErr(await use.execute({}, TEST_RESERVING_AGENT))).toEqual({ type: 'Forbidden' });
    const exporterOnly = Actor.user(PRODUCER_ID, ['reservations:export']);
    expect(unwrapErr(await use.execute({}, exporterOnly))).toEqual({ type: 'Forbidden' });
  });
});
