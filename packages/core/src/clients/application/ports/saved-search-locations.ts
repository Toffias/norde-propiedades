import type { Actor } from '../../../shared';
import type { SavedSearchLocationLabel } from '../../contracts';

/** Los nombres de las ubicaciones de una búsqueda (módulo properties, por su API pública). */
export interface SavedSearchLocations {
  /** Como mucho las de una búsqueda; las que ya no existen no vuelven. */
  labels(
    ids: readonly string[],
    actor: Actor,
  ): Promise<ReadonlyMap<string, SavedSearchLocationLabel>>;
}
