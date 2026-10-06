import type { PortalCredentials, PortalId } from '@norde/core/portals';
import { err, ok, type Clock, type Result } from '@norde/core/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { SecretCipher } from '../adapters/crypto/aes-gcm-secret-cipher';
import type { MercadoLibreAuthorizer } from '../adapters/portals/mercadolibre/mercadolibre-authorizer';
import type { Database } from '../db/client';
import { portalAccounts } from '../db/schema';
import type { InfraLogger } from '../shared/logger';

/** Se renueva si vence en menos de esto: una sincronización hace varias llamadas seguidas. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const StoredSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export type AccessTokenError =
  { readonly type: 'PortalCredentialsMissing' } | { readonly type: 'PortalUnavailable' };

/**
 * El access token vigente de una cuenta de MercadoLibre. El refresh token de ML es de un solo uso:
 * se lee y se renueva con la fila bloqueada (`for update`), así dos jobs no gastan el mismo y dejan
 * la cuenta sin credenciales. Si ML lo rechaza (revocado, vencido), hay que volver a conectar.
 */
export class MercadoLibreTokens {
  constructor(
    private readonly deps: {
      readonly db: Database;
      readonly cipher: SecretCipher;
      readonly authorizer: MercadoLibreAuthorizer;
      readonly clock: Clock;
      readonly logger: InfraLogger;
    },
  ) {}

  async accessToken(portal: PortalId): Promise<Result<string, AccessTokenError>> {
    const { db, cipher, authorizer, clock, logger } = this.deps;
    return db.transaction(async (tx): Promise<Result<string, AccessTokenError>> => {
      const [row] = await tx
        .select({ encrypted: portalAccounts.credentialsEncrypted })
        .from(portalAccounts)
        .where(eq(portalAccounts.portal, portal))
        .limit(1)
        .for('update');
      if (!row?.encrypted) return err({ type: 'PortalCredentialsMissing' });

      const stored = StoredSchema.parse(JSON.parse(cipher.decrypt(row.encrypted)));
      if (new Date(stored.expiresAt).getTime() - clock.now().getTime() > REFRESH_MARGIN_MS) {
        return ok(stored.accessToken);
      }

      const renewed = await authorizer.refresh(portal, stored.refreshToken);
      if (renewed.isErr()) {
        logger.warn({ portal, error: renewed.error.type }, 'MercadoLibre token refresh failed');
        return err(
          renewed.error.type === 'PortalUnavailable'
            ? { type: 'PortalUnavailable' }
            : { type: 'PortalCredentialsMissing' },
        );
      }
      await tx
        .update(portalAccounts)
        .set({ credentialsEncrypted: cipher.encrypt(serialize(renewed.value)) })
        .where(eq(portalAccounts.portal, portal));
      logger.info({ portal }, 'MercadoLibre token refreshed');
      return ok(renewed.value.accessToken);
    });
  }
}

function serialize(credentials: PortalCredentials): string {
  return JSON.stringify({
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt: credentials.expiresAt.toISOString(),
  });
}
