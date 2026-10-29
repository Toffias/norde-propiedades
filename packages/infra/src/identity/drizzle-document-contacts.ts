import type { ReportContact, ReportContacts } from '@norde/core/appraisals';
import type { DocumentContact, DocumentContacts } from '@norde/core/properties';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { branches, users } from '../db/schema';

type Contact = DocumentContact & ReportContact;

const orUndefined = (value: string | null): string | undefined =>
  value === null || value.trim() === '' ? undefined : value;

/**
 * Los contactos de sucursales y usuarios que imprimen los PDF (ficha, vidriera, reporte al
 * propietario e informe de tasación).
 */
export class DrizzleDocumentContacts implements DocumentContacts, ReportContacts {
  constructor(private readonly db: DbExecutor) {}

  async branch(branchId: string | undefined): Promise<Contact | undefined> {
    // La sucursal pedida; si no hay o ya no está, la casa central.
    if (branchId !== undefined && z.uuid().safeParse(branchId).success) {
      const own = await this.findBranch(eq(branches.id, branchId));
      if (own) return own;
    }
    return this.findBranch(eq(branches.isMain, true));
  }

  async user(userId: string): Promise<Contact | undefined> {
    if (!z.uuid().safeParse(userId).success) return undefined;
    const [row] = await this.db
      .select({ name: users.name, phone: users.phoneE164, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .limit(1);
    if (!row) return undefined;
    return {
      name: row.name,
      address: undefined,
      phone: orUndefined(row.phone),
      whatsapp: undefined,
      email: orUndefined(row.email),
      text: undefined,
    };
  }

  private async findBranch(condition: SQL): Promise<Contact | undefined> {
    const [row] = await this.db
      .select({
        name: branches.name,
        address: branches.address,
        phone: branches.phoneE164,
        whatsapp: branches.whatsappE164,
        email: branches.email,
        text: branches.pdfContactText,
      })
      .from(branches)
      .where(and(condition, isNull(branches.deletedAt)))
      .limit(1);
    if (!row) return undefined;
    return {
      name: row.name,
      address: orUndefined(row.address),
      phone: orUndefined(row.phone),
      whatsapp: orUndefined(row.whatsapp),
      email: orUndefined(row.email),
      text: orUndefined(row.text),
    };
  }
}
