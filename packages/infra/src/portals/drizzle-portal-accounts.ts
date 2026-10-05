import {
  PORTAL_CATALOG,
  PORTALS,
  PortalAccount,
  isPortalId,
  type PortalAccountRepository,
  type PortalCredentials,
  type PortalCredentialStore,
  type PortalId,
} from '@norde/core/portals';
import type { Clock } from '@norde/core/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { SecretCipher } from '../adapters/crypto/aes-gcm-secret-cipher';
import type { DbExecutor } from '../db/executor';
import { portalAccounts } from '../db/schema';

/** La cuenta vinculada, en `settings`: el ID y el nombre en el portal. */
const ConnectionSettingsSchema = z.object({
  externalAccountId: z.string().min(1),
  accountName: z.string(),
});

function toAccount(row: typeof portalAccounts.$inferSelect & { readonly portal: PortalId }) {
  const settings = ConnectionSettingsSchema.safeParse(row.settings);
  const connection =
    settings.success && row.connectedAt !== null && row.connectedBy !== null
      ? { ...settings.data, connectedAt: row.connectedAt, connectedBy: row.connectedBy }
      : undefined;
  return PortalAccount.restore({ portal: row.portal, isEnabled: row.isEnabled, connection });
}

/** Cuentas de portales (`portal_accounts`). Una cuenta sin fila es una que nunca se conectó. */
export class DrizzlePortalAccountRepository implements PortalAccountRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly clock: Clock,
  ) {}

  async get(portal: PortalId): Promise<PortalAccount> {
    const [row] = await this.db
      .select()
      .from(portalAccounts)
      .where(eq(portalAccounts.portal, portal))
      .limit(1);
    return row ? toAccount({ ...row, portal }) : PortalAccount.notConnected(portal);
  }

  async all(): Promise<readonly PortalAccount[]> {
    // Como mucho una fila por portal del catálogo.
    const rows = await this.db
      .select()
      .from(portalAccounts)
      .limit(PORTALS.length * 2);
    const byPortal = new Map(
      rows.flatMap((row) => (isPortalId(row.portal) ? [[row.portal, row] as const] : [])),
    );
    return PORTALS.map((portal) => {
      const row = byPortal.get(portal);
      return row ? toAccount({ ...row, portal }) : PortalAccount.notConnected(portal);
    });
  }

  async save(account: PortalAccount, actorId: string): Promise<void> {
    const { portal, isEnabled, connection } = account.toSnapshot();
    const now = this.clock.now();
    const values = {
      isEnabled,
      isPaid: PORTAL_CATALOG[portal].paid,
      settings: connection
        ? { externalAccountId: connection.externalAccountId, accountName: connection.accountName }
        : {},
      connectedAt: connection?.connectedAt ?? null,
      connectedBy: connection?.connectedBy ?? null,
      updatedAt: now,
      updatedBy: actorId,
    };
    await this.db
      .insert(portalAccounts)
      .values({ portal, ...values, createdAt: now, createdBy: actorId })
      .onConflictDoUpdate({ target: portalAccounts.portal, set: values });
  }
}

const StoredCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

/**
 * Tokens de cada cuenta, cifrados en `credentials_encrypted`. La fila la crea antes
 * `DrizzlePortalAccountRepository.save`, en la misma transacción.
 */
export class DrizzlePortalCredentialStore implements PortalCredentialStore {
  constructor(
    private readonly db: DbExecutor,
    private readonly cipher: SecretCipher,
  ) {}

  async save(portal: PortalId, credentials: PortalCredentials): Promise<void> {
    const plaintext = JSON.stringify({
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: credentials.expiresAt.toISOString(),
    });
    const updated = await this.db
      .update(portalAccounts)
      .set({ credentialsEncrypted: this.cipher.encrypt(plaintext) })
      .where(eq(portalAccounts.portal, portal))
      .returning({ portal: portalAccounts.portal });
    if (updated.length === 0) throw new Error(`The ${portal} account must be saved first`);
  }

  async delete(portal: PortalId): Promise<void> {
    await this.db
      .update(portalAccounts)
      .set({ credentialsEncrypted: null })
      .where(eq(portalAccounts.portal, portal));
  }

  /** Las credenciales guardadas, o `undefined` si la cuenta no tiene. */
  async read(portal: PortalId): Promise<PortalCredentials | undefined> {
    const [row] = await this.db
      .select({ encrypted: portalAccounts.credentialsEncrypted })
      .from(portalAccounts)
      .where(eq(portalAccounts.portal, portal))
      .limit(1);
    if (!row?.encrypted) return undefined;
    const stored = StoredCredentialsSchema.parse(JSON.parse(this.cipher.decrypt(row.encrypted)));
    return { ...stored, expiresAt: new Date(stored.expiresAt) };
  }
}
