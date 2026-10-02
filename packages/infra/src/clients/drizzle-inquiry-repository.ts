import {
  CONTACT_CHANNELS,
  Inquiry,
  INQUIRY_STATUSES,
  type InquiryId,
  type InquiryRepository,
  type InquirySnapshot,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { inquiries } from '../db/schema';

// Las columnas `text` con valores del dominio se validan al leer: una fila que no valida está
// corrupta.
const ChannelSchema = z.enum(CONTACT_CHANNELS);
const StatusSchema = z.enum(INQUIRY_STATUSES);

type Row = typeof inquiries.$inferSelect;

const undefinedIfNull = <T>(value: T | null): T | undefined => value ?? undefined;

function toSnapshot(row: Row): InquirySnapshot {
  const id = parseId<'Inquiry'>(row.id);
  if (id.isErr()) throw new Error(`Invalid inquiry id ${row.id}`);
  // `insert` siempre guarda el ID externo; una fila sin él no la escribió este repositorio.
  if (row.externalId === null) throw new Error(`Inquiry ${row.id} has no external id`);
  return {
    id: id.value,
    channel: ChannelSchema.parse(row.channel),
    externalId: row.externalId,
    receivedAt: row.receivedAt,
    sender: {
      name: undefinedIfNull(row.senderName),
      email: undefinedIfNull(row.senderEmail),
      phoneE164: undefinedIfNull(row.senderPhoneE164),
      phoneMatchKey: undefinedIfNull(row.senderPhoneMatchKey),
    },
    message: undefinedIfNull(row.message),
    propertyId: undefinedIfNull(row.propertyId),
    developmentId: undefinedIfNull(row.developmentId),
    branchId: undefinedIfNull(row.branchId),
    autoTags: row.autoTags,
    status: StatusSchema.parse(row.status),
    clientId: undefinedIfNull(row.clientId),
    opportunityId: undefinedIfNull(row.opportunityId),
    assignedAgentId: undefinedIfNull(row.assignedAgentId),
    assignedAt: undefinedIfNull(row.assignedAt),
    assignedBy: undefinedIfNull(row.assignedBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: undefinedIfNull(row.deletedAt),
    deletedBy: undefinedIfNull(row.deletedBy),
  };
}

/** Lo que cambia después del alta: estado, asignación y papelera. */
function mutableValues(s: InquirySnapshot, actorId: string) {
  return {
    status: s.status,
    branchId: s.branchId ?? null,
    clientId: s.clientId ?? null,
    opportunityId: s.opportunityId ?? null,
    assignedAgentId: s.assignedAgentId ?? null,
    assignedAt: s.assignedAt ?? null,
    assignedBy: s.assignedBy ?? null,
    updatedAt: s.updatedAt,
    updatedBy: actorId,
    deletedAt: s.deletedAt ?? null,
    deletedBy: s.deletedBy ?? null,
  };
}

/** Las consultas entrantes (`inquiries`). */
export class DrizzleInquiryRepository implements InquiryRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: InquiryId): Promise<Inquiry | undefined> {
    const [row] = await this.db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);
    return row && Inquiry.restore(toSnapshot(row));
  }

  async findByExternal(channel: string, externalId: string): Promise<Inquiry | undefined> {
    const [row] = await this.db
      .select()
      .from(inquiries)
      .where(and(eq(inquiries.channel, channel), eq(inquiries.externalId, externalId)))
      .limit(1);
    return row && Inquiry.restore(toSnapshot(row));
  }

  /**
   * Si otra transacción insertó la misma consulta, el índice único `(channel, external_id)` espera
   * a que termine y el insert no escribe nada.
   */
  async insert(inquiry: Inquiry, actorId: string): Promise<boolean> {
    const s = inquiry.toSnapshot();
    const inserted = await this.db
      .insert(inquiries)
      .values({
        id: s.id,
        channel: s.channel,
        externalId: s.externalId,
        receivedAt: s.receivedAt,
        senderName: s.sender.name ?? null,
        senderEmail: s.sender.email ?? null,
        senderPhoneE164: s.sender.phoneE164 ?? null,
        senderPhoneMatchKey: s.sender.phoneMatchKey ?? null,
        message: s.message ?? null,
        propertyId: s.propertyId ?? null,
        developmentId: s.developmentId ?? null,
        autoTags: [...s.autoTags],
        createdAt: s.createdAt,
        createdBy: actorId,
        ...mutableValues(s, actorId),
      })
      .onConflictDoNothing()
      .returning({ id: inquiries.id });
    return inserted.length > 0;
  }

  async save(inquiry: Inquiry, actorId: string): Promise<void> {
    const s = inquiry.toSnapshot();
    await this.db.update(inquiries).set(mutableValues(s, actorId)).where(eq(inquiries.id, s.id));
  }
}
