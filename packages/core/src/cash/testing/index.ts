// Fakes del módulo cash para tests (`@norde/core/cash/testing`).

import { Actor, parseId, type PageSlice } from '../../shared';
import { InMemoryAuditLog } from '../../shared/testing';
import type {
  CashMovementListItem,
  CashQuery,
  CashUserNames,
} from '../application/ports/cash-query';

type CashPeriodRow = Awaited<ReturnType<CashQuery['periods']>>['items'][number];
import type { CashTransaction, CashUnitOfWork } from '../application/ports/cash-transaction';
import type { CashBox } from '../domain/cash-box';
import { CashClosing, type CashTotals } from '../domain/cash-closing';
import {
  CashMovement,
  type CashMovementId,
  type CashMovementSnapshot,
} from '../domain/cash-movement';
import { periodOf, type CashPeriod } from '../domain/cash-period';
import type {
  CashClosingRepository,
  CashLedger,
  CashMovementRepository,
} from '../domain/cash.repository';

/** 26/10/2026 a las 15 de Buenos Aires: el mes vigente es 2026-10. */
export const TEST_NOW = new Date('2026-10-26T18:00:00Z');
export const MOVEMENT_ID = '00000000-0000-7000-8000-0000000000e1';
export const CASHIER_ID = '00000000-0000-7000-8000-0000000000a1';
export const ADMIN_ID = '00000000-0000-7000-8000-0000000000a2';

/** El rol "Control de caja": opera el mes vigente, sin meses cerrados, borrado ni log. */
export const TEST_CASHIER = Actor.user(CASHIER_ID, [
  'cash:read',
  'cash:create',
  'cash:update',
  'cash:void',
  'cash:export',
]);
/** Administración: todo, también los meses cerrados. */
export const TEST_CASH_ADMIN = Actor.user(ADMIN_ID, ['cash:*']);
/** Sin permisos sobre la caja. */
export const TEST_OUTSIDER = Actor.user('00000000-0000-7000-8000-0000000000a9', ['clients:read']);

function unwrapId(raw: string): CashMovementId {
  const id = parseId<'CashMovement'>(raw);
  if (id.isErr()) throw new Error(`Invalid test id: ${raw}`);
  return id.value;
}

export function movementSnapshot(
  overrides: Partial<Omit<CashMovementSnapshot, 'id'>> & { readonly id?: string } = {},
): CashMovementSnapshot {
  const { id, ...rest } = overrides;
  return {
    id: unwrapId(id ?? MOVEMENT_ID),
    box: 'office',
    date: '2026-10-20',
    kind: 'expense',
    amountCents: 1_500_000n,
    concept: 'Librería',
    notes: undefined,
    status: 'active',
    createdAt: TEST_NOW,
    createdBy: CASHIER_ID,
    updatedAt: TEST_NOW,
    voidedAt: undefined,
    voidedBy: undefined,
    ...rest,
  };
}

/** Orden de la planilla: fecha y, dentro del día, orden de carga. */
function chronological(a: CashMovementSnapshot, b: CashMovementSnapshot): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt.getTime() !== b.createdAt.getTime()) {
    return a.createdAt.getTime() - b.createdAt.getTime();
  }
  return a.id < b.id ? -1 : 1;
}

function signed(movement: CashMovementSnapshot): bigint {
  return movement.kind === 'income' ? movement.amountCents : -movement.amountCents;
}

export class InMemoryCashMovementRepository implements CashMovementRepository {
  readonly rows = new Map<string, CashMovementSnapshot>();

  add(...snapshots: readonly CashMovementSnapshot[]): void {
    for (const snapshot of snapshots) this.rows.set(snapshot.id, snapshot);
  }

  active(box: CashBox): CashMovementSnapshot[] {
    return [...this.rows.values()].filter((m) => m.box === box && m.status === 'active');
  }

  findById(id: CashMovementId) {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? undefined : CashMovement.restore(row));
  }

  findLastActive(box: CashBox, period: CashPeriod) {
    const last = this.active(box)
      .filter((m) => periodOf(m.date) === period)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
      .at(-1);
    return Promise.resolve(last === undefined ? undefined : CashMovement.restore(last));
  }

  insert(movement: CashMovement) {
    this.rows.set(movement.id, movement.toSnapshot());
    return Promise.resolve();
  }

  save(movement: CashMovement) {
    this.rows.set(movement.id, movement.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryCashClosingRepository implements CashClosingRepository {
  readonly rows = new Map<string, CashClosing>();

  findByPeriod(box: CashBox, period: CashPeriod) {
    return Promise.resolve(this.rows.get(`${box}:${period}`));
  }

  lastPeriod(box: CashBox) {
    const periods = [...this.rows.values()].filter((c) => c.box === box).map((c) => c.period);
    return Promise.resolve(periods.sort().at(-1));
  }

  insertIfMissing(closing: CashClosing) {
    const key = `${closing.box}:${closing.period}`;
    if (this.rows.has(key)) return Promise.resolve(false);
    this.rows.set(key, CashClosing.restore(closing.toSnapshot()));
    return Promise.resolve(true);
  }

  save(closing: CashClosing) {
    this.rows.set(`${closing.box}:${closing.period}`, CashClosing.restore(closing.toSnapshot()));
    return Promise.resolve();
  }
}

export class InMemoryCashLedger implements CashLedger {
  constructor(private readonly movements: InMemoryCashMovementRepository) {}

  firstPeriod(box: CashBox) {
    const periods = [...this.movements.rows.values()]
      .filter((m) => m.box === box)
      .map((m) => periodOf(m.date));
    return Promise.resolve(periods.sort()[0]);
  }

  totals(box: CashBox, period: CashPeriod): Promise<CashTotals> {
    let openingCents = 0n;
    let incomeCents = 0n;
    let expenseCents = 0n;
    for (const m of this.movements.active(box)) {
      const of = periodOf(m.date);
      if (of < period) openingCents += signed(m);
      else if (of === period && m.kind === 'income') incomeCents += m.amountCents;
      else if (of === period) expenseCents += m.amountCents;
    }
    return Promise.resolve({ openingCents, incomeCents, expenseCents });
  }
}

/** Transacción en memoria: guarda una copia y la restaura si el trabajo devuelve un `Err`. */
export class InMemoryCashUnitOfWork implements CashUnitOfWork, CashTransaction {
  readonly movements = new InMemoryCashMovementRepository();
  readonly closings = new InMemoryCashClosingRepository();
  readonly ledger = new InMemoryCashLedger(this.movements);
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (context: CashTransaction) => Promise<T>): Promise<T> {
    const movements = new Map(this.movements.rows);
    const closings = new Map(
      [...this.closings.rows].map(([key, c]) => [key, CashClosing.restore(c.toSnapshot())]),
    );
    const audited = this.audit.entries.length;
    const result = await work(this);
    if (typeof result === 'object' && result !== null && 'ok' in result && result.ok === false) {
      this.movements.rows.clear();
      for (const [key, row] of movements) this.movements.rows.set(key, row);
      this.closings.rows.clear();
      for (const [key, row] of closings) this.closings.rows.set(key, row);
      this.audit.entries.splice(audited);
    }
    return result;
  }
}

/** La planilla calculada sobre el repositorio en memoria. */
export class InMemoryCashQuery implements CashQuery {
  constructor(
    private readonly movementRows: InMemoryCashMovementRepository,
    private readonly closingRows: InMemoryCashClosingRepository,
  ) {}

  #sheet(box: CashBox, period: CashPeriod): CashMovementListItem[] {
    const all = this.movementRows.active(box).sort(chronological);
    let balance = 0n;
    const rows: CashMovementListItem[] = [];
    for (const m of all) {
      balance += signed(m);
      if (periodOf(m.date) !== period) continue;
      rows.push({
        id: m.id,
        date: m.date,
        kind: m.kind,
        amountCents: m.amountCents,
        concept: m.concept,
        notes: m.notes,
        balanceCents: balance,
        createdAt: m.createdAt,
        createdBy: m.createdBy,
      });
    }
    return rows;
  }

  movements(
    params: Parameters<CashQuery['movements']>[0],
  ): Promise<PageSlice<CashMovementListItem>> {
    const rows = this.#sheet(params.box, params.period);
    if (params.sort.direction === 'desc') rows.reverse();
    return Promise.resolve({
      items: rows.slice(params.offset, params.offset + params.limit),
      total: rows.length,
    });
  }

  periods(params: Parameters<CashQuery['periods']>[0]): Promise<PageSlice<CashPeriodRow>> {
    const rows: CashPeriodRow[] = [...this.closingRows.rows.values()]
      .filter((c) => c.box === params.box)
      .map((c) => ({
        period: c.period,
        closingCents: c.toSnapshot().closingCents,
        isCurrent: false,
      }));
    rows.push({ period: params.current, closingCents: undefined, isCurrent: true });
    rows.sort((a, b) => (a.period < b.period ? -1 : 1));
    if (params.sort.direction === 'desc') rows.reverse();
    return Promise.resolve({
      items: rows.slice(params.offset, params.offset + params.limit),
      total: rows.length,
    });
  }
}

export class InMemoryCashUserNames implements CashUserNames {
  constructor(private readonly users: ReadonlyMap<string, string> = new Map()) {}

  names(userIds: readonly string[]) {
    return Promise.resolve(
      new Map(
        userIds.flatMap((id) => {
          const name = this.users.get(id);
          return name === undefined ? [] : [[id, name] as const];
        }),
      ),
    );
  }
}
