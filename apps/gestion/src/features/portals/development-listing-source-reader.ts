import type { BranchDetail } from '@norde/core/identity/contracts';
import {
  developmentAvailability,
  publishableUnits,
  type DevelopmentListingSource,
  type DevelopmentListingSourceReader,
  type ListingSource,
  type ListingSourceReader,
} from '@norde/core/portals';
import type {
  DevelopmentDetail,
  ListPanelPropertiesQuery,
  ListShareablePhotosInput,
  PanelPropertyRow,
  ShareablePhoto,
} from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';

import {
  PORTAL_PHOTO_LIMIT,
  PORTAL_PHOTO_SECONDS,
  contactOf,
  descriptionWithFooter,
  type ListingSourceDeps,
  type UseCase,
} from './listing-source-reader';

// Arma lo que se publica de un emprendimiento con las APIs públicas de properties, settings e
// identity: su ficha, sus fotos y sus unidades disponibles (cada una como se publica una
// propiedad). Vive en el panel porque compone módulos; las reglas (qué unidades, qué estado) están
// en cada módulo.

/** Las unidades disponibles se leen de a una página del listado del panel. */
const UNITS_PAGE_SIZE = 100;
/** Tope de unidades de un aviso: más que esto no entra en un emprendimiento real. */
const MAX_UNITS = 500;

export interface DevelopmentListingSourceDeps {
  readonly developmentDetail: UseCase<{ readonly developmentId: string }, DevelopmentDetail>;
  readonly units: UseCase<ListPanelPropertiesQuery, Page<PanelPropertyRow>>;
  /** El lector de cada unidad: la misma ficha que se publica de una propiedad. */
  readonly unit: ListingSourceReader;
  readonly photos: UseCase<ListShareablePhotosInput, readonly ShareablePhoto[]>;
  readonly companySettings: ListingSourceDeps['companySettings'];
  readonly branch: UseCase<{ readonly branchId: string }, BranchDetail>;
  /** `system:portal-sync`, con `developments:read` además de lo que lee una propiedad. */
  readonly actor: ListingSourceDeps['actor'];
  readonly logger: { warn(details: Record<string, unknown>, message: string): void };
}

/** Los nombres de la ubicación del catálogo del emprendimiento. */
function locationOf(detail: DevelopmentDetail): ListingSource['location'] {
  const level = (kind: string) => detail.locationPath.find((l) => l.kind === kind)?.name;
  return {
    province: level('province'),
    city: level('city'),
    neighborhood: level('neighborhood'),
  };
}

export function developmentListingSourceReader(
  deps: DevelopmentListingSourceDeps,
): DevelopmentListingSourceReader {
  /** Las unidades disponibles, de a una página, hasta el tope. */
  async function availableUnits(developmentId: string): Promise<readonly ListingSource[]> {
    const rows: PanelPropertyRow[] = [];
    for (let page = 1; rows.length < MAX_UNITS; page += 1) {
      const result = await deps.units.execute(
        { developmentId, status: 'available', page, pageSize: UNITS_PAGE_SIZE },
        deps.actor,
      );
      if (result.isErr()) {
        throw new Error(`Cannot list the units of ${developmentId}: ${result.error.type}`);
      }
      rows.push(...result.value.items);
      if (rows.length >= result.value.total || result.value.items.length === 0) break;
    }
    if (rows.length >= MAX_UNITS) {
      deps.logger.warn({ developmentId, max: MAX_UNITS }, 'Development has too many units');
    }
    const units = await Promise.all(rows.slice(0, MAX_UNITS).map((row) => deps.unit.read(row.id)));
    return units.filter((unit) => unit !== undefined);
  }

  return {
    async read(developmentId): Promise<DevelopmentListingSource | undefined> {
      const { actor } = deps;
      const detail = await deps.developmentDetail.execute({ developmentId }, actor);
      if (detail.isErr()) {
        if (detail.error.type === 'DevelopmentNotFound') return undefined;
        throw new Error(`Cannot read development ${developmentId}: ${detail.error.type}`);
      }
      const development = detail.value;
      const [photos, settings, branch, units] = await Promise.all([
        deps.photos.execute(
          { developmentId, expiresInSeconds: PORTAL_PHOTO_SECONDS, limit: PORTAL_PHOTO_LIMIT },
          actor,
        ),
        deps.companySettings.execute({}, actor),
        development.branchId === undefined
          ? undefined
          : deps.branch.execute({ branchId: development.branchId }, actor),
        availableUnits(developmentId),
      ]);
      if (photos.isErr()) throw new Error(`Cannot list photos for portals: ${photos.error.type}`);
      const branchDetail = branch?.isOk() ? branch.value : undefined;
      const listed = publishableUnits(units);
      const address = development.publishAddress.trim();

      return {
        developmentId: development.id,
        code: development.code,
        kind: development.developmentType,
        name: development.name,
        availability: developmentAvailability({
          status: development.status,
          isDeleted: development.deletedAt !== undefined,
          publishableUnits: listed.length,
        }),
        title: development.portalTitle,
        description: descriptionWithFooter(
          { description: development.description, code: development.code, web: undefined },
          settings.isOk() ? settings.value : undefined,
          branchDetail,
        ),
        address: address === '' ? undefined : address,
        coordinates: development.coordinates,
        location: locationOf(development),
        stage: development.constructionStatus,
        deliveryDate: development.deliveryDate,
        photos: photos.value.map((p) => ({ id: p.mediaId, version: p.version, url: p.url })),
        contact: contactOf(branchDetail),
        units: listed,
      };
    },
  };
}
