import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  FindPropertyByPortalAdInputSchema,
  type FindPropertyByPortalAdInput,
} from '../../contracts';
import { parsePortalAdReference } from '../../domain/portal-ad-reference';
import type { PortalAdLookup } from '../ports/portal-ad-lookup';

export type FindPropertyByPortalAdError =
  | ForbiddenError
  /** El texto no es el link ni el número de un aviso de un portal. */
  | { readonly type: 'NotAPortalAd' }
  /** Es un aviso, pero no de una propiedad de Norde. */
  | { readonly type: 'PortalAdNotFound' };

/**
 * La propiedad de un aviso de MercadoLibre o Zonaprop que nombró un cliente ("vi este aviso en
 * Zonaprop"). Los avisos son públicos: alcanza con poder leer propiedades.
 */
export class FindPropertyByPortalAd {
  constructor(private readonly deps: { readonly ads: PortalAdLookup }) {}

  async execute(
    input: FindPropertyByPortalAdInput,
    actor: Actor,
  ): Promise<Result<{ readonly propertyId: string }, FindPropertyByPortalAdError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = FindPropertyByPortalAdInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'NotAPortalAd' });

    const reference = parsePortalAdReference(parsed.data.reference, parsed.data.provider);
    if (!reference) return err({ type: 'NotAPortalAd' });
    const propertyId = await this.deps.ads.propertyIdFor(reference);
    return propertyId === undefined ? err({ type: 'PortalAdNotFound' }) : ok({ propertyId });
  }
}
