import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  RevalidatePublicDevelopmentInputSchema,
  type RevalidatePublicDevelopmentInput,
} from '../../contracts';
import type { PublicSite } from '../ports/public-site';
import { invalidInput, type InvalidInputError } from '../property-support';

export type RevalidatePublicDevelopmentError = ForbiddenError | InvalidInputError;

/**
 * Le avisa a la web que un emprendimiento o su galería cambió, para que rearme su ficha y el
 * listado (ADR 0023). Lo corre un job por cada `development_changed` y por los cambios de su
 * galería; los de sus unidades llegan como cambios de propiedades. Si la web no responde, lanza:
 * la cola reintenta con backoff.
 */
export class RevalidatePublicDevelopment {
  constructor(private readonly deps: { readonly site: PublicSite }) {}

  async execute(
    input: RevalidatePublicDevelopmentInput,
    actor: Actor,
  ): Promise<Result<void, RevalidatePublicDevelopmentError>> {
    if (!actor.can('properties:revalidate-site')) return err({ type: 'Forbidden' });
    const parsed = RevalidatePublicDevelopmentInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    await this.deps.site.revalidateDevelopment(parsed.data.developmentId);
    return ok(undefined);
  }
}
