import type { BranchDetail } from '@norde/core/identity/contracts';
import {
  ownerAvailability,
  type ListingPropertyKind,
  type ListingSource,
  type ListingSourceReader,
} from '@norde/core/portals';
import type { PanelPropertyDetail, ShareablePhoto } from '@norde/core/properties/contracts';
import { DescriptionFooterTemplate, WebUrlTemplate } from '@norde/core/settings';
import type { CompanySettingsView } from '@norde/core/settings/contracts';
import type { Actor, Result } from '@norde/core/shared';

// Arma lo que se publica de una propiedad con las APIs públicas de properties, settings e
// identity. Vive en el panel porque compone módulos; las reglas (qué fotos, qué estado) están en
// cada módulo.

/** Lo que el portal tiene para descargar las fotos: un día alcanza para una sincronización. */
export const PORTAL_PHOTO_SECONDS = 24 * 60 * 60;
/** MercadoLibre acepta hasta 30 fotos por aviso de inmuebles. */
export const PORTAL_PHOTO_LIMIT = 30;

interface UseCase<I, O> {
  execute(input: I, actor: Actor): Promise<Result<O, { readonly type: string }>>;
}

export interface ListingSourceDeps {
  readonly propertyDetail: UseCase<{ readonly propertyId: string }, PanelPropertyDetail>;
  readonly photos: UseCase<
    { readonly propertyId: string; readonly expiresInSeconds: number; readonly limit: number },
    readonly ShareablePhoto[]
  >;
  readonly companySettings: UseCase<Record<string, never>, CompanySettingsView>;
  readonly branch: UseCase<{ readonly branchId: string }, BranchDetail>;
  /** `system:portal-sync`, con `properties:read`, `settings:read` y `branches:read`. */
  readonly actor: Actor;
}

const KINDS: readonly ListingPropertyKind[] = [
  'apartment',
  'house',
  'ph',
  'land',
  'office',
  'commercial',
  'garage',
  'warehouse',
];

function kindOf(value: string): ListingPropertyKind {
  const kind = KINDS.find((k) => k === value);
  if (!kind) throw new Error(`Unknown property type: ${value}`);
  return kind;
}

/** Los nombres de la ubicación del catálogo; si no tiene, los de la dirección. */
function locationOf(detail: PanelPropertyDetail): ListingSource['location'] {
  const level = (kind: string) => detail.locationPath.find((l) => l.kind === kind)?.name;
  const orUndefined = (text: string) => (text.trim() === '' ? undefined : text);
  return {
    province: level('province') ?? orUndefined(detail.address.province),
    city: level('city') ?? orUndefined(detail.address.city),
    neighborhood: level('neighborhood') ?? orUndefined(detail.address.neighborhood),
  };
}

/** La descripción con el pie para portales de Mi empresa (código, contacto de la sucursal, web). */
function descriptionOf(
  detail: PanelPropertyDetail,
  settings: CompanySettingsView | undefined,
  branch: BranchDetail | undefined,
): string {
  const raw = settings?.portalDescriptionFooter;
  const footer = raw === undefined ? undefined : DescriptionFooterTemplate.create(raw);
  if (footer === undefined || footer.isErr()) return detail.description;
  const template = settings?.webPropertyUrlTemplate;
  const web = template === undefined ? undefined : WebUrlTemplate.create(template);
  const text = footer.value.render({
    codigo: detail.code,
    ...(branch?.phone ? { telefono_sucursal: branch.phone } : {}),
    ...(branch?.email ? { email_sucursal: branch.email } : {}),
    ...(branch?.whatsapp ? { whatsapp_sucursal: branch.whatsapp } : {}),
    ...(web?.isOk() ? { url_web: web.value.render({ id: detail.id, slug: detail.slug }) } : {}),
  });
  return text === '' ? detail.description : `${detail.description}\n\n${text}`;
}

export function listingSourceReader(deps: ListingSourceDeps): ListingSourceReader {
  return {
    async read(propertyId) {
      const { actor } = deps;
      const detail = await deps.propertyDetail.execute({ propertyId }, actor);
      if (detail.isErr()) {
        if (detail.error.type === 'PropertyNotFound') return undefined;
        throw new Error(`Cannot read property ${propertyId} for portals: ${detail.error.type}`);
      }
      const property = detail.value;
      const [photos, settings, branch] = await Promise.all([
        deps.photos.execute(
          { propertyId, expiresInSeconds: PORTAL_PHOTO_SECONDS, limit: PORTAL_PHOTO_LIMIT },
          actor,
        ),
        deps.companySettings.execute({}, actor),
        property.branchId === undefined
          ? undefined
          : deps.branch.execute({ branchId: property.branchId }, actor),
      ]);
      if (photos.isErr()) throw new Error(`Cannot list photos for portals: ${photos.error.type}`);
      const branchDetail = branch?.isOk() ? branch.value : undefined;
      const c = property.characteristics;

      return {
        propertyId: property.id,
        code: property.code,
        kind: kindOf(property.propertyType),
        availability: ownerAvailability(property.status, property.deletedAt !== undefined),
        developmentId: property.development?.id,
        title: property.portalTitle,
        description: descriptionOf(
          property,
          settings.isOk() ? settings.value : undefined,
          branchDetail,
        ),
        operations: property.operations.map((o) => ({
          operation: o.operation,
          currency: o.currency,
          priceCents: o.priceCents,
          priceOnRequest: o.priceOnRequest,
        })),
        address: property.publishAddress.trim() === '' ? undefined : property.publishAddress,
        coordinates: property.coordinates,
        location: locationOf(property),
        characteristics: {
          rooms: c.rooms,
          bedrooms: c.bedrooms,
          bathrooms: c.bathrooms,
          toilets: c.toilets,
          parkingSpaces: c.parkingSpaces,
          ageYears: c.ageYears,
          orientation: c.orientation,
          disposition: c.disposition,
          isFurnished: c.isFurnished,
          professionalUse: c.professionalUse,
          surfaceTotalM2: c.surfaceTotalM2,
          surfaceCoveredM2: c.surfaceCoveredM2,
          surfaceLandM2: c.surfaceLandM2,
        },
        expensesCents: property.deal.expensesCents,
        creditEligible: property.deal.creditEligible,
        photos: photos.value.map((p) => ({ id: p.mediaId, version: p.version, url: p.url })),
        contact: {
          name: branchDetail?.name ?? 'Norde Propiedades',
          email: branchDetail?.email,
          phone: branchDetail?.phone,
          whatsapp: branchDetail?.whatsapp,
        },
      };
    },
  };
}
