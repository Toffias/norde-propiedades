import { AggregateRoot } from '../../shared/domain/aggregate-root';
import { err, ok, type Result } from '../../shared/domain/result';

import { PORTAL_CATALOG, type PortalId } from './portal';

/** La cuenta del portal vinculada por OAuth. Las credenciales no viven acá: las guarda infra cifradas. */
export interface PortalConnection {
  /** ID de la cuenta en el portal (en ML, el `user_id` del vendedor). */
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
}

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

  private constructor(snapshot: PortalAccountSnapshot) {
    super(snapshot.portal);
    this.#isEnabled = snapshot.isEnabled;
    this.#connection = snapshot.connection;
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
    // Como `string`: hoy hay un solo proveedor, pero la regla vale cuando se sumen otros.
    const provider: string = PORTAL_CATALOG[this.portal].provider;
    const clash = others.find(
      (other) =>
        other.portal !== this.portal &&
        PORTAL_CATALOG[other.portal].provider === provider &&
        other.#connection?.externalAccountId === connection.externalAccountId,
    );
    if (clash) return err({ type: 'PortalAccountInUse', portal: clash.portal });
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

  toSnapshot(): PortalAccountSnapshot {
    return { portal: this.id, isEnabled: this.#isEnabled, connection: this.#connection };
  }
}
