import type { PropertyInterestProfile } from '../../../clients';
import type { Actor } from '../../../shared';

/** El perfil de la propiedad (tipo, operaciones, ubicación): lo entrega el módulo de propiedades. */
export interface ReportingPropertyProfiles {
  /** `undefined` si no existe o el actor no la puede ver. */
  find(propertyId: string, actor: Actor): Promise<PropertyInterestProfile | undefined>;
}
