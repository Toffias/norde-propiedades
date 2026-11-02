import { err, ok, parseId, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  GetPropertyDetailInputSchema,
  type GetPropertyDetailInput,
  type PropertyDetail,
} from '../../contracts';
import { cleanReferenceCode } from '../../domain/property';
import { isPubliclyListed, isUnreleased } from '../../domain/property-status';
import type { PropertySearchQuery } from '../ports/property-search-query';
import { toPropertyDetail } from '../property-mapper';

export type GetPropertyDetailError =
  | ForbiddenError
  /** No existe, está en la papelera o es un borrador que nunca se ofreció. */
  | { readonly type: 'PropertyNotFound' }
  /**
   * Existe pero ya no se ofrece (vendida, reservada, despublicada). La web muestra "ya no está
   * disponible" con similares y `noindex`, en lugar de un 404 (doc 02 §4.2).
   */
  | { readonly type: 'PropertyNotListed' };

/** Ficha pública de una propiedad, por id o código (agente) o por slug (web). */
export class GetPropertyDetail {
  constructor(private readonly deps: { readonly properties: PropertySearchQuery }) {}

  async execute(
    input: GetPropertyDetailInput,
    actor: Actor,
  ): Promise<Result<PropertyDetail, GetPropertyDetailError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = GetPropertyDetailInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'PropertyNotFound' });
    const record = await this.find(parsed.data);
    if (!record || isUnreleased(record)) return err({ type: 'PropertyNotFound' });

    const detail = isPubliclyListed(record) ? toPropertyDetail(record) : undefined;
    return detail ? ok(detail) : err({ type: 'PropertyNotListed' });
  }

  private find(
    input: { readonly propertyId: string } | { readonly slug: string } | { readonly code: string },
  ) {
    if ('slug' in input) return this.deps.properties.findBySlug(input.slug);
    if ('code' in input) {
      // "dep0001" es el mismo código que "DEP0001"; uno inválido no existe.
      const code = cleanReferenceCode(input.code.replace(/\s+/g, ''));
      return code === undefined
        ? Promise.resolve(undefined)
        : this.deps.properties.findByCode(code);
    }
    const id = parseId<'Property'>(input.propertyId);
    return id.isErr() ? Promise.resolve(undefined) : this.deps.properties.findById(id.value);
  }
}
