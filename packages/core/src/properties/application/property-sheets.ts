import type { CompanySettings, FileStorage } from '../../settings';
import type { MediaItem } from '../domain/media-item';
import { pdfAddress, pdfPrices } from '../domain/property-document';
import { sheetHasMap, type PropertySheetLayout } from '../domain/property-sheet';
import type { PropertyId } from '../domain/property';
import { idOf } from './catalog-support';
import type { PropertiesUnitOfWork } from './ports/properties-transaction';
import type { PropertyDetailLookups } from './ports/property-detail-lookups';
import type { PropertySheet, StaticMaps } from './ports/property-sheets';
import type { UserNames } from './ports/user-names';
import { findProperty } from './property-support';
import { buildPanelPropertyDetail } from './queries/get-panel-property-detail';

// La ficha de una propiedad para el PDF (#175): la usan la ficha sola y la selección del buscador.

/** Cuántas fotos lleva cada formato: la horizontal llena su grilla, la vertical las lleva todas. */
const PHOTOS_PER_LAYOUT: Readonly<Record<PropertySheetLayout, number>> = {
  landscape: 8,
  landscape_map: 7,
  portrait: 24,
  portrait_map: 24,
  grid: 1,
};

/** La foto para imprimir: con marca de agua si la hay, si no la versión web, si no la original. */
export function printableKey(item: MediaItem): string | undefined {
  const { variants, storageKey } = item.toSnapshot();
  return variants.watermarked ?? variants.web ?? storageKey;
}

/** Fichas ya cargadas, como las espera el renderer. */
// eslint-disable-next-line @typescript-eslint/require-await -- adapta una lista ya cargada: no hay nada que esperar.
export async function* sheetsOf(sheets: readonly PropertySheet[]): AsyncIterable<PropertySheet> {
  yield* sheets;
}

export interface PropertySheetDeps {
  readonly uow: PropertiesUnitOfWork;
  readonly lookups: PropertyDetailLookups;
  readonly users: UserNames;
  readonly storage: FileStorage;
  readonly maps: StaticMaps;
}

/**
 * La ficha de una propiedad según "Ficha y PDF": dirección y precio según las reglas, las fotos
 * marcadas "incluir en PDF" (más las del emprendimiento si la configuración lo pide), el mapa en
 * los formatos con mapa y el link a la web si está publicada. `undefined` si ya no existe.
 */
export async function loadPropertySheet(
  propertyId: PropertyId,
  layout: PropertySheetLayout,
  settings: CompanySettings,
  deps: PropertySheetDeps,
): Promise<PropertySheet | undefined> {
  const loaded = await deps.uow.run(async (tx) => {
    const property = await findProperty(tx.properties, propertyId);
    if (!property) return undefined;
    const gallery = await tx.media.listForOwner({ kind: 'property', id: property.id });
    // Una unidad puede sumar las fotos de su emprendimiento: se leen, no se copian.
    const developmentId =
      property.developmentId === undefined
        ? undefined
        : idOf<'Development'>(property.developmentId);
    const developmentGallery =
      developmentId === undefined
        ? []
        : await tx.media.listForOwner({ kind: 'development', id: developmentId });
    return { property, gallery, developmentGallery };
  });
  if (!loaded) return undefined;

  const options = settings.toSnapshot().pdfOptions;
  const detail = await buildPanelPropertyDetail(loaded.property, deps);
  const media = options.developmentPhotosInUnits
    ? [...loaded.gallery, ...loaded.developmentGallery]
    : loaded.gallery;
  const keys = media
    .filter((item) => item.kind === 'photo' && item.toSnapshot().includeInPdf)
    .slice(0, PHOTOS_PER_LAYOUT[layout])
    .flatMap((item) => {
      const key = printableKey(item);
      return key === undefined ? [] : [key];
    });
  const [photos, map] = await Promise.all([
    Promise.all(keys.map((key) => deps.storage.get(key))),
    sheetHasMap(layout) && detail.coordinates !== undefined
      ? deps.maps.render(detail.coordinates)
      : undefined,
  ]);
  const template = settings.toSnapshot().webPropertyUrlTemplate;

  return {
    property: detail,
    address: pdfAddress(detail, options.addressOnDownload),
    prices: pdfPrices(detail.operations, {
      showPrice: options.showPrice,
      showPriceOnWeb: detail.publication.showPriceOnWeb,
    }),
    photos: photos.filter((stored) => stored !== undefined).map((stored) => stored.bytes),
    map,
    // La ficha en la web solo si la web la muestra: si no, el link no abre.
    webUrl:
      detail.isPubliclyListed && template !== undefined
        ? template.render({ id: detail.id, slug: detail.slug })
        : undefined,
  };
}
