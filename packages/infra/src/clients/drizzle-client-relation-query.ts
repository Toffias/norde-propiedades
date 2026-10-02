import {
  CLIENT_KINDS,
  CLIENT_RELATION_KINDS,
  type ClientRelationItem,
  type ClientRelationQuery,
} from '@norde/core/clients';
import type { PageSlice } from '@norde/core/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { clientRelations, clients } from '../db/schema';

const RelationRow = z.object({
  direction: z.enum(['outgoing', 'incoming']),
  kind: z.enum(CLIENT_RELATION_KINDS),
  label: z.string().nullable(),
  other_id: z.string(),
  other_name: z.string().nullable(),
  other_kind: z.enum(CLIENT_KINDS),
  other_agent_id: z.string().nullable(),
  other_branch_id: z.string().nullable(),
});

const CountRow = z.object({ total: z.coerce.number() });

/**
 * Relaciones de un contacto en los dos sentidos: las que declara (`client_id`, por la PK) y las
 * que otros declaran hacia él (`client_relations_related_idx`). Sin los de la papelera.
 */
export class DrizzleClientRelationQuery implements ClientRelationQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(
    criteria: Parameters<ClientRelationQuery['list']>[0],
  ): Promise<PageSlice<ClientRelationItem>> {
    const both = sql`
      select 'outgoing' as direction, r.kind, r.label, r.related_client_id as other_id
      from ${clientRelations} r
      where r.client_id = ${criteria.clientId}
      union all
      select 'incoming' as direction, r.kind, r.label, r.client_id as other_id
      from ${clientRelations} r
      where r.related_client_id = ${criteria.clientId}
    `;
    const order = criteria.direction === 'asc' ? sql`asc` : sql`desc`;
    const rows = await this.db.execute(sql`
      select rel.direction, rel.kind, rel.label, c.id as other_id, c.name as other_name,
        c.kind as other_kind, c.agent_id as other_agent_id, c.branch_id as other_branch_id
      from (${both}) rel
      join ${clients} c on c.id = rel.other_id and c.deleted_at is null
      order by lower(c.name) ${order} nulls last, c.id ${order}, rel.kind
      limit ${criteria.limit} offset ${criteria.offset}
    `);
    const totals = await this.db.execute(sql`
      select count(*) as total
      from (${both}) rel
      join ${clients} c on c.id = rel.other_id and c.deleted_at is null
    `);
    return {
      items: rows.rows.map((raw) => {
        const row = RelationRow.parse(raw);
        return {
          direction: row.direction,
          kind: row.kind,
          label: row.label ?? undefined,
          other: {
            id: row.other_id,
            name: row.other_name ?? undefined,
            kind: row.other_kind,
            agentId: row.other_agent_id ?? undefined,
            branchId: row.other_branch_id ?? undefined,
          },
        };
      }),
      total: CountRow.parse(totals.rows[0] ?? { total: 0 }).total,
    };
  }
}
