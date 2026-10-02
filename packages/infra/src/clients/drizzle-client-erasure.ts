import type { ClientErasure, ErasureRecord } from '@norde/core/clients';
import { and, arrayOverlaps, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import {
  auditLog,
  clientEmails,
  clientPhones,
  clients,
  erasureRecords,
  importMappings,
  inquiries,
} from '../db/schema';

/**
 * Supresión de datos de un cliente (Ley 25.326). Es el único adaptador que borra entradas de
 * `audit_log` (ADR 0015). Lo demás del módulo cae con las foreign keys `on delete cascade` de
 * `clients`, salvo las consultas que todavía no se asignaron: esas se borran por sus datos de
 * contacto.
 */
export class DrizzleClientErasure implements ClientErasure {
  constructor(private readonly db: DbExecutor) {}

  async mergedInto(clientId: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.mergedIntoId, clientId))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async erase(clientIds: readonly string[], now: Date): Promise<void> {
    if (clientIds.length === 0) return;
    const ids = [...clientIds];
    await this.eraseUnassignedInquiries(ids);
    await this.db.delete(auditLog).where(arrayOverlaps(auditLog.clientIds, ids));
    await this.db.delete(clients).where(inArray(clients.id, ids));
    await this.db
      .update(importMappings)
      .set({ erasedAt: now, updatedAt: now })
      .where(and(eq(importMappings.entityType, 'client'), inArray(importMappings.internalId, ids)));
  }

  /**
   * Las consultas sin cliente (pendientes o borradas sin asignar) con alguno de sus teléfonos o
   * emails: son datos de la misma persona. Antes de borrar al cliente, que se lleva sus teléfonos y
   * emails. Las entradas de auditoría de esas consultas no tienen datos personales.
   */
  private async eraseUnassignedInquiries(ids: string[]): Promise<void> {
    const phoneKeys = this.db
      .select({ key: clientPhones.phoneMatchKey })
      .from(clientPhones)
      .where(inArray(clientPhones.clientId, ids));
    const mainPhoneKeys = this.db
      .select({ key: clients.phoneMatchKey })
      .from(clients)
      .where(inArray(clients.id, ids));
    const emails = this.db
      .select({ email: sql<string>`lower(${clientEmails.email})` })
      .from(clientEmails)
      .where(inArray(clientEmails.clientId, ids));
    const mainEmails = this.db
      .select({ email: clients.email })
      .from(clients)
      .where(inArray(clients.id, ids));
    await this.db
      .delete(inquiries)
      .where(
        and(
          isNull(inquiries.clientId),
          or(
            inArray(inquiries.senderPhoneMatchKey, phoneKeys),
            inArray(inquiries.senderPhoneMatchKey, mainPhoneKeys),
            inArray(sql`lower(${inquiries.senderEmail})`, emails),
            inArray(sql`lower(${inquiries.senderEmail})`, mainEmails),
          ),
        ),
      );
  }

  async record(record: ErasureRecord): Promise<void> {
    await this.db.insert(erasureRecords).values({
      id: record.id,
      erasedEntityType: record.erasedEntityType,
      erasedEntityId: record.erasedEntityId,
      requestedAt: record.requestedAt,
      executedBy: record.executedBy,
      executedAt: record.executedAt,
    });
  }
}
