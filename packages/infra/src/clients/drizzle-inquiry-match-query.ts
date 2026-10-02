import type {
  InquiryMatchCriteria,
  InquiryMatchItem,
  InquiryMatchQuery,
} from '@norde/core/clients';
import type { PageSlice } from '@norde/core/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { clientChannels, clientEmails, clientPhones, clients } from '../db/schema';

const MatchRow = z.object({
  id: z.string(),
  name: z.string().nullable(),
  company_name: z.string().nullable(),
  agent_id: z.string().nullable(),
  branch_id: z.string().nullable(),
  by_phone: z.boolean(),
  by_email: z.boolean(),
  created_at: z.coerce.date(),
  last_contact_at: z.coerce.date().nullable(),
  deleted_at: z.coerce.date().nullable(),
});

const CountRow = z.object({ total: z.coerce.number() });

/**
 * Los clientes que comparten el teléfono o el email de una consulta. Busca en el principal (índices
 * únicos de `clients`) y en todos los demás (`client_phones_match_key_idx`,
 * `client_emails_email_idx`), como la deduplicación del alta. Las lápidas de una unificación no
 * cuentan: el cliente es el que quedó.
 */
export class DrizzleInquiryMatchQuery implements InquiryMatchQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: InquiryMatchCriteria): Promise<PageSlice<InquiryMatchItem>> {
    const hits = this.hits(criteria);
    if (hits === undefined) return { items: [], total: 0 };

    const matched = sql`
      select h.client_id, bool_or(h.by_phone) as by_phone, bool_or(h.by_email) as by_email
      from (${hits}) h
      group by h.client_id
    `;
    const rows = await this.db.execute(sql`
      select c.id, c.name, c.company_name, c.agent_id, c.branch_id, m.by_phone, m.by_email,
        c.created_at, c.deleted_at,
        (select max(ch.last_contact_at) from ${clientChannels} ch where ch.client_id = c.id)
          as last_contact_at
      from (${matched}) m
      join ${clients} c on c.id = m.client_id and c.merged_into_id is null
      order by m.by_phone desc, (c.deleted_at is null) desc, c.updated_at desc, c.id
      limit ${criteria.limit} offset ${criteria.offset}
    `);
    const totals = await this.db.execute(sql`
      select count(*) as total
      from (${matched}) m
      join ${clients} c on c.id = m.client_id and c.merged_into_id is null
    `);

    return {
      items: rows.rows.map((raw) => {
        const row = MatchRow.parse(raw);
        return {
          id: row.id,
          name: row.name ?? undefined,
          companyName: row.company_name ?? undefined,
          agentId: row.agent_id ?? undefined,
          branchId: row.branch_id ?? undefined,
          matchedByPhone: row.by_phone,
          matchedByEmail: row.by_email,
          createdAt: row.created_at,
          lastContactAt: row.last_contact_at ?? undefined,
          deletedAt: row.deleted_at ?? undefined,
        };
      }),
      total: CountRow.parse(totals.rows[0] ?? { total: 0 }).total,
    };
  }

  /** Una fila por cada lugar donde coincide, con por qué dato. */
  private hits({ phoneMatchKey, email }: InquiryMatchCriteria): SQL | undefined {
    const parts: SQL[] = [];
    if (phoneMatchKey !== undefined) {
      parts.push(sql`
        select c.id as client_id, true as by_phone, false as by_email
        from ${clients} c where c.phone_match_key = ${phoneMatchKey}
        union all
        select p.client_id, true, false
        from ${clientPhones} p where p.phone_match_key = ${phoneMatchKey}
      `);
    }
    if (email !== undefined) {
      parts.push(sql`
        select c.id as client_id, false as by_phone, true as by_email
        from ${clients} c where c.email = ${email}
        union all
        select e.client_id, false, true
        from ${clientEmails} e where lower(e.email) = ${email}
      `);
    }
    return parts.length === 0 ? undefined : sql.join(parts, sql` union all `);
  }
}
