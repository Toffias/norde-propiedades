import type { Actor } from '../../shared';

/**
 * Ver la difusión en portales: las publicaciones, los créditos y las cuentas conectadas. Lo tiene
 * quien solo mira (`portals:read`), quien publica y quien administra las cuentas.
 */
export function canSeePortals(actor: Actor): boolean {
  return actor.can('portals:read') || actor.can('portals:publish') || actor.can('portals:manage');
}
