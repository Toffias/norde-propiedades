import { AggregateRoot } from '../../shared/domain/aggregate-root';
import { err, ok, type Result } from '../../shared/domain/result';

import { PORTAL_CATALOG, type PortalId } from './portal';

/** La cuenta del portal vinculada (por OAuth o por su código). Las credenciales no viven acá. */
export interface PortalConnection {
  /** ID de la cuenta en el portal: en ML, el `user_id`; en Zonaprop, el código de inmobiliaria. */
  readonly externalAccountId: string;
  /** Nombre visible de la cuenta (en ML, el nickname). */
  readonly accountName: string;
  readonly connectedAt: Date;
  /** Usuario que la conectó. */
  readonly connectedBy: string;
}

export interface PortalAccountSnapshot {
  readonly portal: PortalId;
  readonly isEnabled: boolean;
  readonly connection: PortalConnection | undefined;
  /**
   * Desde cuándo están leídos sin cortes los contactos de los avisos (la última lectura completa):
   * la próxima lee desde ahí.
   */
  readonly leadsPulledAt?: Date | undefined;
}

/** Días hacia atrás que se leen siempre: cubren lo que el portal demora en informar un contacto. */
export const LEADS_LOOKBACK_DAYS = 2;
/** Tope de días hacia atrás después de un corte largo: más atrás, el portal ya no reintenta. */
export const LEADS_MAX_LOOKBACK_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PortalNotConnectedError {
  readonly type: 'PortalNotConnected';
}

/** La misma cuenta del portal ya está conectada en otra cuenta de Norde del mismo proveedor. */
export interface PortalAccountInUseError {
  readonly type: 'PortalAccountInUse';
  readonly portal: PortalId;
}

/** Cuenta de Norde en un portal: si está conectada y si se ofrece para publicar. */
export class PortalAccount extends AggregateRoot<PortalId> {
  #isEnabled: boolean;
  #connection: PortalConnection | undefined;
  #leadsPulledAt: Date | undefined;

  private constructor(snapshot: PortalAccountSnapshot) {
    super(snapshot.portal);
    this.#isEnabled = snapshot.isEnabled;
    this.#connection = snapshot.connection;
    this.#leadsPulledAt = snapshot.leadsPulledAt;
  }

  /** Una cuenta que todavía no se conectó (no tiene fila en la base). */
  static notConnected(portal: PortalId): PortalAccount {
    return new PortalAccount({ portal, isEnabled: false, connection: undefined });
  }

  static restore(snapshot: PortalAccountSnapshot): PortalAccount {
    return new PortalAccount(snapshot);
  }

  get portal(): PortalId {
    return this.id;
  }

  get isConnected(): boolean {
    return this.#connection !== undefined;
  }

  /** Conectada y activada: se puede publicar con ella. */
  get canPublish(): boolean {
    return this.#connection !== undefined && this.#isEnabled;
  }

  /**
   * Vincula la cuenta del portal. Volver a conectar reemplaza la anterior (por ejemplo, cuando el
   * portal revocó el acceso). Dos cuentas de Norde del mismo proveedor no pueden usar la misma
   * cuenta del portal: en ML, la de emprendimientos no puede publicar avisos comunes.
   */
  connect(
    connection: PortalConnection,
    others: readonly PortalAccount[],
  ): Result<void, PortalAccountInUseError> {
    const { provider } = PORTAL_CATALOG[this.portal];
    const clash = others.find(
      (other) =>
        other.portal !== this.portal &&
        PORTAL_CATALOG[other.portal].provider === provider &&
        other.#connection?.externalAccountId === connection.externalAccountId,
    );
    if (clash) return err({ type: 'PortalAccountInUse', portal: clash.portal });
    // Otra cuenta del portal: sus contactos se leen desde cero.
    if (this.#connection?.externalAccountId !== connection.externalAccountId) {
      this.#leadsPulledAt = undefined;
    }
    this.#connection = connection;
    return ok(undefined);
  }

  /** Desvincula la cuenta. Una cuenta desconectada no se ofrece para publicar. */
  disconnect(): Result<void, PortalNotConnectedError> {
    if (!this.#connection) return err({ type: 'PortalNotConnected' });
    this.#connection = undefined;
    this.#isEnabled = false;
    return ok(undefined);
  }

  /** Solo se activa una cuenta conectada. */
  enable(): Result<void, PortalNotConnectedError> {
    if (!this.#connection) return err({ type: 'PortalNotConnected' });
    this.#isEnabled = true;
    return ok(undefined);
  }

  disable(): void {
    this.#isEnabled = false;
  }

  /**
   * Desde cuándo leer los contactos de los avisos: los últimos días siempre y, si la última lectura
   * completa es más vieja (el panel o el portal estuvieron caídos), desde ahí, con un tope.
   */
  leadsSince(now: Date): Date {
    const lookback = now.getTime() - LEADS_LOOKBACK_DAYS * DAY_MS;
    const floor = now.getTime() - LEADS_MAX_LOOKBACK_DAYS * DAY_MS;
    const pulled = this.#leadsPulledAt?.getTime() ?? lookback;
    return new Date(Math.max(floor, Math.min(lookback, pulled)));
  }

  /** Se leyeron todos los contactos hasta `at` (cuando empezó la lectura). */
  recordLeadsPulled(at: Date): void {
    this.#leadsPulledAt = at;
  }

  toSnapshot(): PortalAccountSnapshot {
    return {
      portal: this.id,
      isEnabled: this.#isEnabled,
      connection: this.#connection,
      leadsPulledAt: this.#leadsPulledAt,
    };
  }
}
