/** Permiso con formato `recurso:acción` (`properties:update`). `recurso:*` otorga todas las acciones. */
export type Permission = `${string}:${string}`;

/** Procesos que ejecutan casos de uso sin un usuario humano detrás. */
export type SystemActorName = 'agent-ia' | 'portal-sync' | 'scheduler' | 'web';

/**
 * Quién ejecuta un caso de uso. Todo caso de uso recibe un Actor y decide la autorización
 * con `actor.can(...)`; ocultar un botón en la UI no es autorización.
 */
export class Actor {
  private constructor(
    readonly id: string,
    readonly kind: 'user' | 'system',
    private readonly permissions: ReadonlySet<Permission>,
  ) {}

  static user(userId: string, permissions: Iterable<Permission>): Actor {
    return new Actor(userId, 'user', new Set(permissions));
  }

  static system(name: SystemActorName, permissions: Iterable<Permission>): Actor {
    return new Actor(`system:${name}`, 'system', new Set(permissions));
  }

  can(permission: Permission): boolean {
    if (this.permissions.has(permission)) return true;
    const resource = permission.slice(0, permission.indexOf(':'));
    return this.permissions.has(`${resource}:*`);
  }
}
