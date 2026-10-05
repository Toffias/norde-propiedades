// Fakes del módulo portals para tests (`@norde/core/portals/testing`).

import { err, ok, type Result } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  PortalAuthorizationError,
  PortalAuthorizationGrant,
  PortalAuthorizationRequest,
  PortalAuthorizer,
  PortalCredentials,
  PortalNotConfiguredError,
} from '../application/ports/portal-authorizer';
import type {
  PortalCredentialStore,
  PortalsTransaction,
  PortalsUnitOfWork,
} from '../application/ports/portals-transaction';
import { PORTALS, type PortalId } from '../domain/portal';
import { PortalAccount, type PortalAccountSnapshot } from '../domain/portal-account';
import type { PortalAccountRepository } from '../domain/portals.repository';

export class InMemoryPortalAccountRepository implements PortalAccountRepository {
  readonly rows = new Map<PortalId, PortalAccountSnapshot>();

  get(portal: PortalId) {
    const row = this.rows.get(portal);
    return Promise.resolve(row ? PortalAccount.restore(row) : PortalAccount.notConnected(portal));
  }

  async all() {
    return Promise.all(PORTALS.map((portal) => this.get(portal)));
  }

  save(account: PortalAccount) {
    this.rows.set(account.portal, account.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryPortalCredentialStore implements PortalCredentialStore {
  readonly stored = new Map<PortalId, PortalCredentials>();

  save(portal: PortalId, credentials: PortalCredentials) {
    this.stored.set(portal, credentials);
    return Promise.resolve();
  }

  delete(portal: PortalId) {
    this.stored.delete(portal);
    return Promise.resolve();
  }
}

/**
 * Unidad de trabajo en memoria. Si el trabajo devuelve un `Err` o lanza, descarta lo escrito
 * (como el rollback de la implementación real).
 */
export class InMemoryPortalsUnitOfWork implements PortalsUnitOfWork {
  readonly accounts = new InMemoryPortalAccountRepository();
  readonly credentials = new InMemoryPortalCredentialStore();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: PortalsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      accounts: new Map(this.accounts.rows),
      credentials: new Map(this.credentials.stored),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const rollback = () => {
      this.accounts.rows.clear();
      for (const [k, v] of backup.accounts) this.accounts.rows.set(k, v);
      this.credentials.stored.clear();
      for (const [k, v] of backup.credentials) this.credentials.stored.set(k, v);
      this.events.published.splice(backup.events);
      this.audit.entries.splice(backup.audit);
    };

    try {
      const result = await work(this);
      if (isErrResult(result)) rollback();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

/**
 * Autorizador de prueba: arma una URL falsa y canjea cualquier código por `grant`. Con
 * `notConfigured` o `failWith`, falla como el portal real.
 */
export class FakePortalAuthorizer implements PortalAuthorizer {
  notConfigured = false;
  failWith: PortalAuthorizationError | undefined;
  grant: PortalAuthorizationGrant = {
    credentials: {
      accessToken: 'APP_USR-access',
      refreshToken: 'TG-refresh',
      expiresAt: new Date('2026-10-05T18:00:00Z'),
    },
    externalAccountId: '123456789',
    accountName: 'NORDEPROPIEDADES',
  };
  readonly completed: { portal: PortalId; code: string; codeVerifier: string }[] = [];

  begin(portal: PortalId): Result<PortalAuthorizationRequest, PortalNotConfiguredError> {
    if (this.notConfigured) return err({ type: 'PortalNotConfigured' });
    return ok({
      url: `https://portal.test/authorize?portal=${portal}&state=state-1`,
      state: 'state-1',
      codeVerifier: 'v'.repeat(43),
    });
  }

  complete(input: {
    readonly portal: PortalId;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<Result<PortalAuthorizationGrant, PortalAuthorizationError>> {
    this.completed.push({ ...input });
    if (this.notConfigured) return Promise.resolve(err({ type: 'PortalNotConfigured' }));
    if (this.failWith) return Promise.resolve(err(this.failWith));
    return Promise.resolve(ok(this.grant));
  }
}
