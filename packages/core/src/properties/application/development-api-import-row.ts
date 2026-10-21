import { err, ok, type Result } from '../../shared';
import { MAX_DESCRIPTION_LENGTH } from '../contracts';
import { Coordinates } from '../domain/coordinates';
import type { ConstructionStatus, DevelopmentKind, DevelopmentStatus } from '../domain/development';
import { MAX_MEDIA_PER_OWNER } from '../domain/media-item';
import { cleanReferenceCode } from '../domain/property';
import {
  tokkoApiPlace,
  tokkoConstructionStatus,
  tokkoDeliveryDate,
  tokkoDevelopmentKind,
  tokkoDevelopmentName,
  tokkoReferenceCode,
  type TokkoPlace,
} from '../domain/tokko-property';

import type { TokkoApiDevelopment, TokkoApiPhoto } from './ports/tokko-property-source';
import type { RowProblem } from './property-import-row';

/** Un emprendimiento de la API de Tokko, listo para crearlo o completar el que ya está. */
export interface ApiImportedDevelopment {
  readonly code: string;
  readonly name: string;
  readonly kind: DevelopmentKind;
  readonly privateAddress: string;
  readonly place: TokkoPlace;
  /** Comercializando si estaba publicado en la web de Tokko; si no, cargando información. */
  readonly status: DevelopmentStatus;
  readonly constructionStatus: ConstructionStatus | undefined;
  readonly deliveryDate: string | undefined;
  readonly portalTitle: string | undefined;
  readonly description: string | undefined;
  readonly financingDetails: string | undefined;
  readonly coordinates: Coordinates | undefined;
  readonly producerName: string | undefined;
  readonly photos: readonly TokkoApiPhoto[];
  readonly warnings: readonly RowProblem[];
}

/** El título para portales de Norde (como el formulario de la ficha). */
const MAX_PORTAL_TITLE_LENGTH = 120;

function optionalText(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  return text === undefined || text === '' ? undefined : text;
}

/**
 * Un emprendimiento de la API de Tokko: su código de Tokko como código de Norde (como las
 * propiedades), el nombre, la ubicación con su partido, el estado de obra, la descripción, las
 * coordenadas y las fotos. Decidido con Norde el 2026-10-20 (`docs/negocio/decisiones.md`).
 */
export function readTokkoApiDevelopment(
  development: TokkoApiDevelopment,
): Result<ApiImportedDevelopment, RowProblem> {
  const code = cleanReferenceCode(tokkoReferenceCode(development.referenceCode));
  if (code === undefined) return err({ code: 'invalid_code', field: 'code' });
  // Tokko suma el estado de obra al nombre ("AV. RIVADAVIA 9540 + EN POZO").
  const name = tokkoDevelopmentName(development.name);
  if (name === undefined) return err({ code: 'invalid_value', field: 'development' });
  const privateAddress = optionalText(development.address);
  if (privateAddress === undefined) return err({ code: 'missing_address', field: 'address' });

  const warnings: RowProblem[] = [];
  const description = optionalText(development.description);
  if (description !== undefined && description.length > MAX_DESCRIPTION_LENGTH) {
    warnings.push({ code: 'description_truncated', field: undefined });
  }
  const latitude = development.latitude ?? 0;
  const longitude = development.longitude ?? 0;
  // Tokko guarda 0 cuando no lo ubicó en el mapa.
  const coordinates =
    latitude === 0 && longitude === 0 ? undefined : Coordinates.create(latitude, longitude);

  return ok({
    code,
    name,
    kind: tokkoDevelopmentKind(development.typeCode),
    privateAddress,
    place: tokkoApiPlace(development.fullLocation),
    status: development.displayOnWeb ? 'marketing' : 'loading',
    constructionStatus: tokkoConstructionStatus(development.constructionStatus),
    deliveryDate: tokkoDeliveryDate(development.constructionDate),
    portalTitle: optionalText(development.title)?.slice(0, MAX_PORTAL_TITLE_LENGTH),
    description: description?.slice(0, MAX_DESCRIPTION_LENGTH),
    financingDetails: optionalText(development.financingDetails),
    coordinates: coordinates?.isOk() === true ? coordinates.value : undefined,
    producerName: optionalText(development.producerName),
    photos: [...development.photos].sort((a, b) => a.order - b.order).slice(0, MAX_MEDIA_PER_OWNER),
    warnings,
  });
}
