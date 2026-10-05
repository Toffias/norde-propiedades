import type { HistoryValue, NewsEntryRow } from '@norde/core/audit/contracts';
import { describe, expect, it } from 'vitest';

import { parseNewsKinds, serializeNewsKinds } from './news-kinds';
import { newsAuthor, newsDayLabel, newsDayOf, newsLines, type NewsLine } from './news-format';

const USER = '00000000-0000-7000-8000-0000000000a1';

/** Intl separa la moneda con un espacio duro: se compara con espacios comunes. */
const spaces = (text: string) => text.replace(/\s/g, ' ');
const plain = (lines: readonly NewsLine[]) =>
  lines.map((line) => ({
    ...line,
    text: spaces(line.text),
    ...(line.price && {
      price: {
        now: spaces(line.price.now),
        before: spaces(line.price.before),
        percent: line.price.percent && spaces(line.price.percent),
      },
    }),
  }));

function entry(overrides: Partial<NewsEntryRow>): NewsEntryRow {
  return {
    id: 'entry',
    occurredAt: new Date('2026-10-03T20:09:00Z'),
    kind: 'property.price_changed',
    action: 'property.updated',
    actor: { id: USER, name: 'Camila' },
    assignee: undefined,
    changes: {},
    ...overrides,
  };
}

const sale = (priceCents: bigint | null, currency = 'USD') => ({
  operation: 'sale',
  currency,
  priceCents,
});

describe('newsLines', () => {
  it('says whether the price went up or down, with the previous price', () => {
    expect(
      plain(
        newsLines(
          entry({
            changes: { operations: { before: [sale(12_000_000n)], after: [sale(12_800_000n)] } },
          }),
        ),
      ),
    ).toEqual([
      {
        text: 'El precio de venta subió a',
        trend: 'up',
        price: { now: 'US$ 128.000', before: 'US$ 120.000', percent: '+6,7%' },
      },
    ]);
    expect(
      plain(
        newsLines(
          entry({
            changes: { operations: { before: [sale(12_000_000n)], after: [sale(1_280_000n)] } },
          }),
        ),
      ),
    ).toEqual([
      {
        text: 'El precio de venta bajó a',
        trend: 'down',
        price: { now: 'US$ 12.800', before: 'US$ 120.000', percent: '-89,3%' },
      },
    ]);
  });

  it('describes a price that was loaded, removed or changed currency', () => {
    const lines = (before: HistoryValue[], after: HistoryValue[]) =>
      plain(newsLines(entry({ changes: { operations: { before, after } } }))).map(
        (line) => line.text,
      );
    expect(lines([sale(null)], [sale(12_000_000n)])).toEqual([
      'Se cargó el precio de venta: US$ 120.000',
    ]);
    expect(lines([sale(12_000_000n)], [sale(null)])).toEqual([
      'Se quitó el precio de venta (antes US$ 120.000)',
    ]);
    expect(lines([sale(12_000_000n)], [sale(12_000_000n, 'ARS')])[0]).toMatch(
      /^El precio de venta pasó a \$ 120\.000 \(antes US\$ 120\.000\)$/,
    );
  });

  it('lists the operations before and after an operation change', () => {
    expect(
      newsLines(
        entry({
          kind: 'property.operation_changed',
          changes: {
            operations: {
              before: [sale(1n)],
              after: [sale(1n), { operation: 'rent', currency: 'ARS', priceCents: 2n }],
            },
          },
        }),
      ),
    ).toEqual([{ text: 'Ahora se ofrece en venta y alquiler (antes: venta)' }]);
  });

  it('names the statuses, the reservation step and the new agent', () => {
    expect(
      newsLines(
        entry({
          kind: 'property.status_changed',
          action: 'property.status_changed',
          changes: { status: { before: 'available', after: 'reserved' } },
        }),
      ),
    ).toEqual([{ text: 'Pasó de Disponible a Reservada' }]);
    expect(
      newsLines(entry({ kind: 'property.reservation', action: 'property.reservation_fallen' })),
    ).toEqual([{ text: 'Se cayó la reserva' }]);
    expect(
      newsLines(
        entry({
          kind: 'client.reassigned',
          action: 'client.reassigned',
          assignee: { id: USER, name: 'Pedro' },
        }),
      ),
    ).toEqual([{ text: 'Se reasignó a Pedro' }]);
  });
});

describe('newsAuthor', () => {
  it('names the user, the AI agent or the system', () => {
    expect(newsAuthor(entry({}))).toBe('Camila');
    expect(newsAuthor(entry({ actor: { id: 'system:agent-ia', name: undefined } }))).toBe(
      'El agente de IA',
    );
    expect(newsAuthor(entry({ actor: { id: 'system:import', name: undefined } }))).toBe(
      'El sistema',
    );
  });
});

describe('newsDayLabel', () => {
  it('says today, yesterday or the date, with the year only when it is another one', () => {
    expect(newsDayLabel('2026-10-05', '2026-10-05')).toBe('Hoy');
    expect(newsDayLabel('2026-10-04', '2026-10-05')).toBe('Ayer');
    expect(newsDayLabel('2026-10-02', '2026-10-05')).toMatch(/^Viernes,? 2 de octubre$/);
    expect(newsDayLabel('2025-12-31', '2026-01-01')).toBe('Ayer');
    expect(newsDayLabel('2025-12-30', '2026-01-01')).toMatch(/2025$/);
  });

  it('takes the day in Buenos Aires', () => {
    expect(newsDayOf(new Date('2026-10-05T02:00:00Z'))).toBe('2026-10-04');
  });
});

describe('news kinds cookie', () => {
  it('shows every kind without a cookie and keeps only known kinds', () => {
    expect(parseNewsKinds(undefined)).toHaveLength(8);
    expect(parseNewsKinds('client.deleted,foo,client.created')).toEqual([
      'client.created',
      'client.deleted',
    ]);
    expect(parseNewsKinds(serializeNewsKinds([]))).toEqual([]);
  });
});
