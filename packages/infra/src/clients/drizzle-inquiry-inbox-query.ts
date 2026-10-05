import {
  CONTACT_CHANNELS,
  INQUIRY_STATUSES,
  type InquiryInboxCriteria,
  type InquiryInboxFilters,
  type InquiryInboxItem,
  type InquiryInboxQuery,
} from '@norde/core/clients';
import type { InquiryTabCounts, InquiryTabValue } from '@norde/core/clients/contracts';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { inquiries } from '../db/schema';

const RowEnums = z.object({
  channel: z.enum(CONTACT_CHANNELS),
  status: z.enum(INQUIRY_STATUSES),
});

const rowColumns = {
  id: inquiries.id,
  channel: inquiries.channel,
  status: inquiries.status,
  receivedAt: inquiries.receivedAt,
  senderName: inquiries.senderName,
  senderEmail: inquiries.senderEmail,
  senderPhoneE164: inquiries.senderPhoneE164,
  message: inquiries.message,
  autoTags: inquiries.autoTags,
  propertyId: inquiries.propertyId,
  branchId: inquiries.branchId,
  clientId: inquiries.clientId,
  assignedAgentId: inquiries.assignedAgentId,
  assignedAt: inquiries.assignedAt,
  deletedAt: inquiries.deletedAt,
  deletedBy: inquiries.deletedBy,
};

const undefinedIfNull = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * La bandeja de consultas. Pendientes y Asignadas recorren los índices parciales que empiezan por
 * `status` (con `branch_id` si se filtra por sucursal); Borradas, el de `received_at` de las
 * borradas (ver `schema/clients.ts`).
 */
export class DrizzleInquiryInboxQuery implements InquiryInboxQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: InquiryInboxCriteria): Promise<PageSlice<InquiryInboxItem>> {
    const where = and(...this.filters(criteria));
    const by = criteria.sort.direction === 'asc' ? asc : desc;
    const [rows, totals] = await Promise.all([
      this.db
        .select(rowColumns)
        .from(inquiries)
        .where(where)
        .orderBy(by(inquiries.receivedAt), by(inquiries.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(inquiries).where(where),
    ]);
    return {
      items: rows.map((row): InquiryInboxItem => {
        const enums = RowEnums.parse(row);
        return {
          id: row.id,
          channel: enums.channel,
          status: enums.status,
          receivedAt: row.receivedAt,
          senderName: undefinedIfNull(row.senderName),
          senderEmail: undefinedIfNull(row.senderEmail),
          senderPhoneE164: undefinedIfNull(row.senderPhoneE164),
          message: undefinedIfNull(row.message),
          autoTags: row.autoTags,
          propertyId: undefinedIfNull(row.propertyId),
          branchId: undefinedIfNull(row.branchId),
          clientId: undefinedIfNull(row.clientId),
          assignedAgentId: undefinedIfNull(row.assignedAgentId),
          assignedAt: undefinedIfNull(row.assignedAt),
          deletedAt: undefinedIfNull(row.deletedAt),
          deletedBy: undefinedIfNull(row.deletedBy),
        };
      }),
      total: totals[0]?.total ?? 0,
    };
  }

  /** Un conteo por pestaña, cada uno por su índice parcial (como la lista de esa pestaña). */
  async countByTab(filters: InquiryInboxFilters): Promise<InquiryTabCounts> {
    const countTab = async (tab: InquiryTabValue) => {
      const [row] = await this.db
        .select({ total: count() })
        .from(inquiries)
        .where(and(...this.filters({ ...filters, tab })));
      return row?.total ?? 0;
    };
    const [pending, assigned, deleted] = await Promise.all([
      countTab('pending'),
      countTab('assigned'),
      countTab('deleted'),
    ]);
    return { pending, assigned, deleted };
  }

  async countPending(): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(inquiries)
      .where(and(eq(inquiries.status, 'pending'), isNull(inquiries.deletedAt)));
    return row?.total ?? 0;
  }

  private filters(c: InquiryInboxFilters & { readonly tab: InquiryTabValue }): (SQL | undefined)[] {
    return [
      c.tab === 'deleted'
        ? isNotNull(inquiries.deletedAt)
        : and(eq(inquiries.status, c.tab), isNull(inquiries.deletedAt)),
      c.branchId === undefined ? undefined : eq(inquiries.branchId, c.branchId),
      c.channel === undefined ? undefined : eq(inquiries.channel, c.channel),
      c.propertyId === undefined ? undefined : eq(inquiries.propertyId, c.propertyId),
      c.received.from === undefined ? undefined : gte(inquiries.receivedAt, c.received.from),
      c.received.to === undefined ? undefined : lt(inquiries.receivedAt, c.received.to),
    ];
  }
}
