import type { Actor } from '../../../shared';

/**
 * Quién pidió una acción masiva, con sus permisos de ahora: el job la procesa como ese usuario. Lo
 * implementa la composición con identity; un usuario suspendido o que ya no existe no tiene.
 */
export interface OpportunityRequesters {
  actorFor(userId: string): Promise<Actor | undefined>;
}
