import type { AuditSource } from './ports';

/** Permiso con formato `recurso:acción` (`properties:update`). `recurso:*` otorga todas las acciones. */
export type Permission = `${string}:${string}`;

/** Procesos que ejecutan casos de uso sin un usuario humano detrás. */
export type SystemActorName = 'agent-ia' | 'portal-sync' | 'scheduler' | 'web' | 'import' | 'auth';

const SYSTEM_SOURCES: Readonly<Record<SystemActorName, AuditSource>> = {
  'agent-ia': 'agent',
  'portal-sync': 'scheduler',
  scheduler: 'scheduler',
  web: 'web',
  import: 'import',
  // Arma la sesión del panel y audita los ingresos.
  auth: 'gestion',
};

/**
 * Quién ejecuta un caso de uso. Todo caso de uso recibe un Actor y decide la autorización
 * con `actor.can(...)`; ocultar un botón en la UI no es autorización.
 */
export class Actor {
  private constructor(
    readonly id: string,
    readonly kind: 'user' | 'system',
    /** Desde dónde actúa, para la auditoría: un usuario siempre actúa desde el panel. */
    readonly source: AuditSource,
    private readonly permissions: ReadonlySet<Permission>,
    /** Permisos quitados explícitamente: ganan sobre los otorgados, también sobre `recurso:*`. */
    private readonly denied: ReadonlySet<Permission>,
    /** ID del request o del job: agrupa las entradas de auditoría de una misma ejecución. */
    readonly correlationId: string | undefined,
    /**
     * Sucursal del usuario: la usan las reglas de pertenencia ("de su sucursal"). Un usuario sin
     * sucursal y los actores de sistema no tienen.
     */
    readonly branchId: string | undefined,
  ) {}

  static user(
    userId: string,
    permissions: Iterable<Permission>,
    denied: Iterable<Permission> = [],
  ): Actor {
    return new Actor(
      userId,
      'user',
      'gestion',
      new Set(permissions),
      new Set(denied),
      undefined,
      undefined,
    );
  }

  static system(name: SystemActorName, permissions: Iterable<Permission>): Actor {
    return new Actor(
      `system:${name}`,
      'system',
      SYSTEM_SOURCES[name],
      new Set(permissions),
      new Set(),
      undefined,
      undefined,
    );
  }

  /** El mismo actor, para una ejecución concreta (request, mensaje entrante, job). */
  withCorrelation(correlationId: string): Actor {
    return new Actor(
      this.id,
      this.kind,
      this.source,
      this.permissions,
      this.denied,
      correlationId,
      this.branchId,
    );
  }

  /** El mismo actor, con la sucursal del usuario. */
  withBranch(branchId: string | undefined): Actor {
    return new Actor(
      this.id,
      this.kind,
      this.source,
      this.permissions,
      this.denied,
      this.correlationId,
      branchId,
    );
  }

  can(permission: Permission): boolean {
    const wildcard: Permission = `${permission.slice(0, permission.indexOf(':'))}:*`;
    if (this.denied.has(permission) || this.denied.has(wildcard)) return false;
    return this.permissions.has(permission) || this.permissions.has(wildcard);
  }
}
