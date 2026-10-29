import type { OwnerContact, OwnerContacts } from '@norde/core/properties';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { clientPhones, clients } from '../db/schema';

/**
 * El contacto de un propietario para la planilla de tasación: el nombre, el teléfono principal, el
 * primer celular y el email. Un cliente en la papelera o unificado con otro no sale.
 */
export class DrizzleOwnerContacts implements OwnerContacts {
  constructor(private readonly db: DbExecutor) {}

  async find(clientId: string): Promise<OwnerContact | undefined> {
    if (!z.uuid().safeParse(clientId).success) return undefined;
    const [row] = await this.db
      .select({
        name: clients.name,
        companyName: clients.companyName,
        phone: clients.phoneE164,
        email: clients.email,
      })
      .from(clients)
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt), isNull(clients.mergedIntoId)))
      .limit(1);
    if (!row) return undefined;
    const [mobile] = await this.db
      .select({ phone: clientPhones.phoneE164 })
      .from(clientPhones)
      .where(and(eq(clientPhones.clientId, clientId), eq(clientPhones.kind, 'mobile')))
      .orderBy(asc(clientPhones.position))
      .limit(1);
    return {
      name: row.name ?? row.companyName ?? 'Sin nombre',
      phone: row.phone ?? undefined,
      mobile: mobile?.phone ?? undefined,
      email: row.email ?? undefined,
    };
  }
}
