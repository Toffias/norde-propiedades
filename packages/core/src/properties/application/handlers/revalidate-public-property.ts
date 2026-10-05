import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  RevalidatePublicPropertyInputSchema,
  type RevalidatePublicPropertyInput,
} from '../../contracts';
import type { PublicSite } from '../ports/public-site';
import { invalidInput, type InvalidInputError } from '../property-support';

export type RevalidatePublicPropertyError = ForbiddenError | InvalidInputError;

/**
 * Le avisa a la web que una propiedad o su galería cambió, para que rearme su ficha y sus listados
 * (ADR 0023). Lo corre un job por cada `property_changed`, `media_changed` y `media_deleted`. Si la
 * web no responde, lanza: la cola reintenta con backoff.
 */
export class RevalidatePublicProperty {
  constructor(private readonly deps: { readonly site: PublicSite }) {}

  async execute(
    input: RevalidatePublicPropertyInput,
    actor: Actor,
  ): Promise<Result<void, RevalidatePublicPropertyError>> {
    if (!actor.can('properties:revalidate-site')) return err({ type: 'Forbidden' });
    const parsed = RevalidatePublicPropertyInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    await this.deps.site.revalidateProperty(parsed.data.propertyId);
    return ok(undefined);
  }
}
