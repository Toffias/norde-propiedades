import {
  CLIENT_KINDS,
  CLIENT_LETTERS,
  CLIENT_TYPES,
  type ClientFilterCriteria,
  type ClientLetter,
  type ClientLetterCount,
  type ClientListCriteria,
  type ClientListItem,
  type ClientListQuery,
} from '@norde/core/clients';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  arrayContains,
  arrayOverlaps,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  clientInitial,
  clientPhones,
  clients,
  clientTagAssignments,
  opportunities,
} from '../db/schema';
import { matchesSearchText } from '../db/text-search';

import { visibleClients } from './saved-search-matching';

const LetterSchema = z.enum(CLIENT_LETTERS);

/** La expresión de `clients_initial_name_idx`. */
const initial = clientInitial(clients.name);

/** Las letras de la "a" a la "z"; el resto de las iniciales va en "#". */
function letterFilter(letter: ClientLetter): SQL {
  return letter === '#' ? sql`${initial} !~ '^[a-z]$'` : sql`${initial} = ${letter.toLowerCase()}`;
}

const tagged = sql`exists (select 1 from ${clientTagAssignments} a where a.client_id = ${clients.id})`;

const RowEnums = z.object({
  kind: z.enum(CLIENT_KINDS),
  clientTypes: z.array(z.enum(CLIENT_TYPES)),
});

const listColumns = {
  id: clients.id,
  kind: clients.kind,
  name: clients.name,
  companyName: clients.companyName,
  phoneE164: clients.phoneE164,
  email: clients.email,
  clientTypes: clients.clientTypes,
  agentId: clients.agentId,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
  deletedAt: clients.deletedAt,
  deletedBy: clients.deletedBy,
};

function selectList(db: DbExecutor) {
  return db.select(listColumns).from(clients);
}
type ListRow = Awaited<ReturnType<typeof selectList>>[number];

function by(direction: 'asc' | 'desc', expression: SQL | AnyColumn): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

const undefinedIfNull = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * Grilla de contactos del panel. Cada filtro y orden tiene su índice (ver `schema/clients.ts`); el
 * test de integración lo cubre con 5.000 contactos.
 */
export class DrizzleClientListQuery implements ClientListQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: ClientListCriteria): Promise<PageSlice<ClientListItem>> {
    const where = and(...this.filters(criteria));
    const [rows, total] = await Promise.all([
      selectList(this.db)
        .where(where)
        .orderBy(...this.order(criteria))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.countWhere(where),
    ]);
    return { items: await this.toItems(rows), total };
  }

  count(criteria: ClientFilterCriteria): Promise<number> {
    return this.countWhere(and(...this.filters(criteria)));
  }

  async letters(criteria: ClientFilterCriteria): Promise<ClientLetterCount[]> {
    const rows = await this.db
      .select({ initial: sql<string>`${initial}`, total: count() })
      .from(clients)
      .where(and(...this.filters({ ...criteria, letter: undefined })))
      .groupBy(initial);
    const counts = new Map<ClientLetter, number>();
    for (const row of rows) {
      const letter = LetterSchema.catch('#').parse(row.initial.toUpperCase());
      counts.set(letter, (counts.get(letter) ?? 0) + row.total);
    }
    return [...counts].map(([letter, total]) => ({ letter, count: total }));
  }

  private async countWhere(where: SQL | undefined): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(clients).where(where);
    return row?.total ?? 0;
  }

  private filters(c: ClientFilterCriteria): (SQL | undefined)[] {
    return [
      c.view === 'trash' ? isNotNull(clients.deletedAt) : isNull(clients.deletedAt),
      // Los unificados quedan en la papelera vacíos: no se listan ni se restauran.
      c.view === 'trash' ? isNull(clients.mergedIntoId) : undefined,
      visibleClients(c.visibility),
      c.text === undefined ? undefined : matchesSearchText(clients.searchText, c.text),
      c.agentId === undefined ? undefined : eq(clients.agentId, c.agentId),
      c.branchId === undefined ? undefined : eq(clients.branchId, c.branchId),
      c.kind === undefined ? undefined : eq(clients.kind, c.kind),
      // La PK de `client_tag_assignments` empieza por `client_id`.
      c.tagged === undefined ? undefined : c.tagged === 'with' ? tagged : sql`not ${tagged}`,
      c.tagId === undefined
        ? undefined
        : sql`exists (select 1 from ${clientTagAssignments} a where a.client_id = ${clients.id} and a.tag_id = ${c.tagId})`,
      c.letter === undefined ? undefined : letterFilter(c.letter),
      // `@>` y `&&` usan el índice GIN de `client_types`; `= any(...)` no.
      c.clientType === undefined ? undefined : arrayContains(clients.clientTypes, [c.clientType]),
      c.anyOfTypes === undefined
        ? undefined
        : arrayOverlaps(clients.clientTypes, [...c.anyOfTypes]),
      // `opportunities_stage_updated_idx` (por estado) o `opportunities_client_status_idx`.
      c.opportunityStageId === undefined
        ? undefined
        : sql`exists (select 1 from ${opportunities} o where o.client_id = ${clients.id} and o.stage_id = ${c.opportunityStageId})`,
      c.created.from === undefined ? undefined : gte(clients.createdAt, c.created.from),
      c.created.to === undefined ? undefined : lt(clients.createdAt, c.created.to),
      c.updated.from === undefined ? undefined : gte(clients.updatedAt, c.updated.from),
      c.updated.to === undefined ? undefined : lt(clients.updatedAt, c.updated.to),
    ];
  }

  private order(c: ClientListCriteria): SQL[] {
    const { field, direction } = c.sort;
    const tiebreak = by(direction, clients.id);
    switch (field) {
      case 'name':
        // La misma expresión que `clients_name_lower_idx` (y, dentro de una letra, que
        // `clients_initial_name_idx`).
        return [by(direction, sql`lower(${clients.name})`), tiebreak];
      case 'createdAt':
        return [by(direction, clients.createdAt), tiebreak];
      case 'updatedAt':
        return [by(direction, clients.updatedAt), tiebreak];
    }
  }

  private async toItems(rows: readonly ListRow[]): Promise<ClientListItem[]> {
    const phones = await this.phonesOf(rows.map((row) => row.id));
    return rows.map((row): ClientListItem => {
      const enums = RowEnums.parse(row);
      const own = phones.get(row.id);
      return {
        id: row.id,
        kind: enums.kind,
        name: undefinedIfNull(row.name),
        companyName: undefinedIfNull(row.companyName),
        // Los registrados antes de las filas hijas solo tienen el principal en `clients`.
        phone: own === undefined ? undefinedIfNull(row.phoneE164) : own.phone,
        mobile: own?.mobile,
        email: undefinedIfNull(row.email),
        clientTypes: enums.clientTypes,
        agentId: undefinedIfNull(row.agentId),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: undefinedIfNull(row.deletedAt),
        deletedBy: undefinedIfNull(row.deletedBy),
      };
    });
  }

  /** El primer teléfono que no es celular y el primer celular de cada contacto de la página. */
  private async phonesOf(
    clientIds: readonly string[],
  ): Promise<Map<string, { phone: string | undefined; mobile: string | undefined }>> {
    const byClient = new Map<string, { phone: string | undefined; mobile: string | undefined }>();
    if (clientIds.length === 0) return byClient;
    const rows = await this.db
      .select({
        clientId: clientPhones.clientId,
        kind: clientPhones.kind,
        phoneE164: clientPhones.phoneE164,
      })
      .from(clientPhones)
      .where(inArray(clientPhones.clientId, [...clientIds]))
      .orderBy(clientPhones.clientId, clientPhones.position);
    for (const row of rows) {
      const entry = byClient.get(row.clientId) ?? { phone: undefined, mobile: undefined };
      if (row.kind === 'mobile') entry.mobile ??= row.phoneE164;
      else entry.phone ??= row.phoneE164;
      byClient.set(row.clientId, entry);
    }
    return byClient;
  }
}
