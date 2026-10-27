import type { FollowUpListingProfile, PropertyInterestProfile } from '../../contracts';

/** El perfil de una propiedad para los seguimientos automáticos, por la API de properties. */
export interface FollowUpListings {
  /** `undefined` si no existe o está en la papelera. */
  find(propertyId: string): Promise<FollowUpListingProfile | undefined>;
}

/** Una búsqueda guardada con envío automático que coincide con la propiedad. */
export interface FollowUpSearchCandidate {
  readonly savedSearchId: string;
  readonly clientId: string;
  readonly operation: string;
}

/** Una destacada vigente con auto-envío de novedades. */
export interface FollowUpFeaturedCandidate {
  readonly featuredListingId: string;
  readonly clientId: string;
}

/**
 * A quién le interesa una propiedad para los seguimientos automáticos, en SQL y de a páginas
 * (ordenadas por ID). Solo búsquedas y destacadas con envío automático, de contactos que no están
 * en la papelera ni se dieron de baja.
 */
export interface FollowUpCandidatesQuery {
  /**
   * Las búsquedas que coinciden con el perfil (`matchesSavedSearch`). Con `operation`, solo las de
   * esa operación. Con `savedUntil`, solo las guardadas hasta ese momento: una propiedad es nueva
   * para una búsqueda si empezó a ofrecerse después de guardarla.
   */
  searches(criteria: {
    readonly profile: PropertyInterestProfile;
    readonly operation: string | undefined;
    readonly savedUntil: Date | undefined;
    readonly offset: number;
    readonly limit: number;
  }): Promise<readonly FollowUpSearchCandidate[]>;
  /** Las destacadas de la propiedad. */
  featured(criteria: {
    readonly propertyId: string;
    readonly offset: number;
    readonly limit: number;
  }): Promise<readonly FollowUpFeaturedCandidate[]>;
}
