import type { PortalAdReference } from '../../domain/portal-ad-reference';

/** La propiedad publicada con un aviso de un portal (no los de emprendimientos). */
export interface PortalAdLookup {
  propertyIdFor(reference: PortalAdReference): Promise<string | undefined>;
}
