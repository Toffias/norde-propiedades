import 'server-only';

import { pageQuerySchema } from '@norde/core/shared/contracts';
import { toOffsetLimit, toPage, type Page } from '@norde/core/shared';
import { z } from 'zod';

import { DEMO_CONTACTS, type ContactStatus, type DemoContact } from './demo-data';

// Contract y "query" de la demo de grilla paginada. La query reemplaza al puerto de consulta: en una
// pantalla real esto es SQL con WHERE + ORDER BY + LIMIT/OFFSET y COUNT en @norde/infra
// (ver .claude/skills/gestion-feature/grilla-paginada.md). Acá filtra y corta un array fijo de
// datos de mentira, solo para ejercitar la grilla.

export const DEMO_CONTACT_SORT_FIELDS = ['name', 'status', 'createdAt'] as const;
const CONTACT_STATUSES = ['new', 'following', 'closed'] as const satisfies readonly ContactStatus[];

export const DemoContactsQuerySchema = pageQuerySchema({
  sortable: DEMO_CONTACT_SORT_FIELDS,
  defaultSort: { field: 'createdAt', direction: 'desc' },
}).extend({
  text: z.string().trim().min(1).max(100).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  /**
   * Solo para la demo: fuerza el estado vacío, un error esperado (`error`) o una excepción
   * (`crash`, que loguea `instrumentation.ts` y muestra `error.tsx`).
   */
  demo: z.enum(['empty', 'error', 'crash']).optional(),
});

export type DemoContactsQuery = z.output<typeof DemoContactsQuerySchema>;

/** 37 contactos de la demo repetidos hasta 148, para tener varias páginas. */
const ROWS: readonly DemoContact[] = Array.from({ length: 4 }, (_, round) =>
  DEMO_CONTACTS.map((contact) => ({
    ...contact,
    id: `${contact.id}-${String(round)}`,
    createdAt: contact.createdAt.replace('2026-09', `2026-0${String(9 - round)}`),
  })),
).flat();

function compare(a: DemoContact, b: DemoContact, field: DemoContactsQuery['sort']['field']) {
  const byField = a[field].localeCompare(b[field], 'es');
  return byField === 0 ? a.id.localeCompare(b.id) : byField;
}

export function searchDemoContacts(query: DemoContactsQuery): Page<DemoContact> {
  const { page, pageSize, sort, text, status, demo } = query;
  if (demo === 'crash') throw new Error('Unexpected failure forced by the paged grid demo');
  const term = text?.toLowerCase();
  const matching =
    demo === 'empty'
      ? []
      : ROWS.filter(
          (contact) =>
            (status === undefined || contact.status === status) &&
            (term === undefined ||
              contact.name.toLowerCase().includes(term) ||
              contact.phone.includes(term)),
        ).sort((a, b) => {
          const order = compare(a, b, sort.field);
          return sort.direction === 'desc' ? -order : order;
        });
  const { offset, limit } = toOffsetLimit({ page, pageSize });
  return toPage(
    { items: matching.slice(offset, offset + limit), total: matching.length },
    { page, pageSize },
  );
}
