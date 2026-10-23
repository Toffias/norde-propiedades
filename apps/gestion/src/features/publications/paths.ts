import type { ListingOwnerKindValue, PortalValue } from '@norde/core/portals/contracts';
import type { PublicationBucketValue } from '@norde/core/reporting/contracts';
import type { Route } from 'next';

/** La pantalla de un portal, con el tipo de aviso y el contador elegidos en la URL. */
export function portalPath(
  portal: PortalValue,
  kind: ListingOwnerKindValue,
  bucket: PublicationBucketValue = 'published',
): Route {
  const params = new URLSearchParams({ kind, bucket });
  // typedRoutes no verifica un string armado: la ruta existe en `app/(panel)/difusion/[portal]`.
  return `/difusion/${portal}?${params.toString()}` as Route;
}

/** La ficha de lo publicado, en su pestaña Difusión. */
export function ownerPath(owner: { readonly kind: ListingOwnerKindValue; readonly id: string }) {
  return (
    owner.kind === 'development'
      ? `/emprendimientos/${owner.id}?tab=difusion`
      : `/propiedades/${owner.id}?tab=difusion`
  ) as Route;
}
