// Reglas de pertenencia: "lo suyo", "lo de su sucursal" y "lo de cualquiera". En Tokko son
// permisos globales sueltos (ver contactos de su sucursal, borrar propiedades de otros...); acá cada
// acción sobre algo que tiene dueño declara qué permiso cubre cada alcance, y el caso de uso lo
// evalúa contra el registro concreto. El permiso solo no alcanza: hay que saber de quién es.

import type { PermissionClaim } from './access';

/** Quién actúa. El `Actor` de la sesión cumple esta forma. */
export interface OwnershipSubject {
  readonly id: string;
  readonly kind: 'user' | 'system';
  readonly branchId: string | undefined;
  can(permission: PermissionClaim): boolean;
}

/** De quién es el registro: el agente responsable (o productor) y su sucursal. */
export interface OwnedTarget {
  readonly ownerId: string | undefined;
  readonly ownerBranchId: string | undefined;
}

/** Qué permiso cubre cada alcance de una acción. Si falta uno, ese alcance no existe. */
export interface OwnershipRule {
  /** Sobre lo propio (`clients:update`). */
  readonly own: PermissionClaim;
  /** Sobre lo de otros de su misma sucursal (`clients:read-branch`). */
  readonly branch?: PermissionClaim;
  /** Sobre lo de cualquiera (`clients:read-all`, `clients:delete-others`). */
  readonly all?: PermissionClaim;
}

export type AccessScope = 'own' | 'branch' | 'all';

/**
 * Hasta dónde llega el sujeto con una acción: el alcance más amplio que le dan sus permisos, o
 * `undefined` si no puede ni sobre lo propio. Un actor de sistema (agente de IA, importación) no
 * tiene cartera propia: con el permiso de la acción, alcanza todo.
 */
export function accessScope(
  subject: OwnershipSubject,
  rule: OwnershipRule,
): AccessScope | undefined {
  if (subject.kind === 'system') return subject.can(rule.own) ? 'all' : undefined;
  if (rule.all !== undefined && subject.can(rule.all)) return 'all';
  // Sin sucursal asignada no hay "su sucursal": queda en lo propio.
  if (rule.branch !== undefined && subject.can(rule.branch) && subject.branchId !== undefined) {
    return 'branch';
  }
  return subject.can(rule.own) ? 'own' : undefined;
}

/**
 * ¿Puede hacer la acción sobre este registro? Un registro sin dueño (un contacto que todavía nadie
 * tomó) es "de otros": hace falta el alcance de su sucursal o el de todos.
 */
export function canActOn(
  subject: OwnershipSubject,
  rule: OwnershipRule,
  target: OwnedTarget,
): boolean {
  const scope = accessScope(subject, rule);
  switch (scope) {
    case 'all':
      return true;
    case 'branch':
      return (
        target.ownerId === subject.id ||
        (target.ownerBranchId !== undefined && target.ownerBranchId === subject.branchId)
      );
    case 'own':
      return target.ownerId !== undefined && target.ownerId === subject.id;
    case undefined:
      return false;
  }
}

/**
 * El mismo alcance como filtro de un listado, para que la query lo resuelva en SQL (nunca filtrar
 * en memoria): todo, lo propio más lo de su sucursal, solo lo propio, o nada.
 */
export type VisibilityFilter =
  | { readonly kind: 'all' }
  | { readonly kind: 'branch'; readonly ownerId: string; readonly branchId: string }
  | { readonly kind: 'own'; readonly ownerId: string }
  | { readonly kind: 'none' };

export function visibilityFilter(subject: OwnershipSubject, rule: OwnershipRule): VisibilityFilter {
  const scope = accessScope(subject, rule);
  if (scope === 'all') return { kind: 'all' };
  if (scope === 'branch' && subject.branchId !== undefined) {
    return { kind: 'branch', ownerId: subject.id, branchId: subject.branchId };
  }
  if (scope === 'own') return { kind: 'own', ownerId: subject.id };
  return { kind: 'none' };
}

/**
 * Las reglas de los permisos globales relevados en Tokko. Los módulos las usan desde la API pública
 * de identity (`OWNERSHIP_RULES.clientsRead`).
 */
export const OWNERSHIP_RULES = {
  clientsRead: { own: 'clients:read', branch: 'clients:read-branch', all: 'clients:read-all' },
  clientsUpdate: { own: 'clients:update', all: 'clients:update-others' },
  clientsDelete: { own: 'clients:delete', all: 'clients:delete-others' },
  propertiesUpdate: {
    own: 'properties:update',
    branch: 'properties:update-branch',
    all: 'properties:update-all',
  },
  propertiesDelete: { own: 'properties:delete', all: 'properties:delete-others' },
  developmentsUpdate: {
    own: 'developments:update',
    branch: 'developments:update-branch',
    all: 'developments:update-all',
  },
  appraisalsRead: { own: 'appraisals:read', all: 'appraisals:read-others' },
  auditRead: { own: 'audit:read', all: 'audit:read-others' },
} as const satisfies Readonly<Record<string, OwnershipRule>>;
