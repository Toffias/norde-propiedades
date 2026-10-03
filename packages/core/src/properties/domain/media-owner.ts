import type { DevelopmentId } from './development';
import type { PropertyId } from './property';

/** De quién son una foto o un archivo: una propiedad (o unidad) o un emprendimiento. */
export type MediaOwner =
  | { readonly kind: 'property'; readonly id: PropertyId }
  | { readonly kind: 'development'; readonly id: DevelopmentId };

export type MediaOwnerKind = MediaOwner['kind'];

export function sameOwner(a: MediaOwner, b: MediaOwner): boolean {
  return a.kind === b.kind && a.id === b.id;
}
