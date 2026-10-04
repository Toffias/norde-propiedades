import type { DomainEvent } from '../../shared/domain/domain-event';

import type { AppraisalCurrency } from './appraisal-result';
import type { AppraisalStatus } from './appraisal-status';
import type { AppraisalCondition, AppraisalPropertyType } from './appraisal-values';

interface AppraisalPayload {
  readonly appraisalId: string;
  readonly requesterClientId: string;
}

export type AppraisalRequested = DomainEvent<'appraisals.appraisal_requested', AppraisalPayload>;
export type AppraisalUpdated = DomainEvent<'appraisals.appraisal_updated', AppraisalPayload>;
export type AppraisalStatusChanged = DomainEvent<
  'appraisals.appraisal_status_changed',
  AppraisalPayload & { readonly from: AppraisalStatus; readonly to: AppraisalStatus }
>;
export type AppraisalDeleted = DomainEvent<'appraisals.appraisal_deleted', AppraisalPayload>;
export type AppraisalRestored = DomainEvent<'appraisals.appraisal_restored', AppraisalPayload>;
export type AppraisalResultRecorded = DomainEvent<
  'appraisals.appraisal_result_recorded',
  AppraisalPayload
>;
/** Una foto se sacó de la tasación: un job borra su archivo del storage. */
export type AppraisalPhotoDeleted = DomainEvent<
  'appraisals.appraisal_photo_deleted',
  AppraisalPayload & { readonly storageKeys: readonly string[] }
>;

/** Precio de una operación del borrador: el máximo sugerido, en centavos como texto (JSON). */
export interface ConvertedListingPrice {
  readonly priceCents: string;
  readonly currency: AppraisalCurrency;
}

/**
 * Lo que necesita properties para crear el borrador: la propiedad se crea con `propertyId`, que ya
 * quedó en la tasación. Los campos sin dato no viajan.
 */
export interface ConvertedListing {
  readonly propertyId: string;
  readonly appraisalCode: string;
  readonly propertyType: AppraisalPropertyType;
  readonly address?: string;
  readonly surfaceTotalM2?: number;
  readonly surfaceCoveredM2?: number;
  readonly rooms?: number;
  readonly bedrooms?: number;
  readonly bathrooms?: number;
  readonly condition?: AppraisalCondition;
  readonly producerUserId: string;
  readonly branchId?: string;
  readonly appraiserUserId?: string;
  readonly sale?: ConvertedListingPrice;
  readonly rent?: ConvertedListingPrice;
  /** Originales de las fotos, en orden: la primera es la portada. */
  readonly photoKeys: readonly string[];
}

export type AppraisalConverted = DomainEvent<
  'appraisals.appraisal_converted',
  AppraisalPayload & { readonly listing: ConvertedListing }
>;

export type AppraisalEvent =
  | AppraisalRequested
  | AppraisalUpdated
  | AppraisalStatusChanged
  | AppraisalDeleted
  | AppraisalRestored
  | AppraisalResultRecorded
  | AppraisalPhotoDeleted
  | AppraisalConverted;
