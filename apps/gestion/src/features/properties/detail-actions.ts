'use server';

import {
  ChangePropertyCodeInputSchema,
  ChangePropertyProducerInputSchema,
  ChangePropertyStatusInputSchema,
  ChangePropertyTagsInputSchema,
  CreateCustomAttributeInputSchema,
  ListPropertyDocumentsQuerySchema,
  RequestPropertyDocumentInputSchema,
  SendOwnerReportInputSchema,
  UpdateCustomAttributeInputSchema,
  UpdatePropertyCharacteristicsInputSchema,
  UpdatePropertyCustomAttributesInputSchema,
  UpdatePropertyDealInputSchema,
  UpdatePropertyDescriptionInputSchema,
  UpdatePropertyFeaturesInputSchema,
  UpdatePropertyInternalInfoInputSchema,
  UpdatePropertyLocationInputSchema,
  UpdatePropertyOperationsInputSchema,
  UpdatePropertyPublicationInputSchema,
  type ChangePropertyCodeInput,
  type ChangePropertyProducerInput,
  type ChangePropertyStatusInput,
  type ChangePropertyTagsInput,
  type CreateCustomAttributeInput,
  type GeocodingOutcome,
  type PropertyDocumentRow,
  type RequestPropertyDocumentInput,
  type SendOwnerReportInput,
  type UpdateCustomAttributeInput,
  type UpdatePropertyCharacteristicsInput,
  type UpdatePropertyCustomAttributesInput,
  type UpdatePropertyDealInput,
  type UpdatePropertyDescriptionInput,
  type UpdatePropertyFeaturesInput,
  type UpdatePropertyInternalInfoInput,
  type UpdatePropertyLocationInput,
  type UpdatePropertyOperationsInput,
  type UpdatePropertyPublicationInput,
} from '@norde/core/properties/contracts';
import type { Result } from '@norde/core/shared';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError, type ErrorMessages, type ExpectedError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  CUSTOM_ATTRIBUTE_ERROR_MESSAGES,
  DETAIL_ERROR_MESSAGES,
  DETAIL_LIST_ERROR_MESSAGES,
  DOCUMENT_ERROR_MESSAGES,
} from './detail-messages';

// Server Actions de la ficha de propiedad (#6): una por caso de uso.

const INVALID = DETAIL_ERROR_MESSAGES.InvalidInput;

function properties() {
  return getContainer().properties;
}

/**
 * Mapea el resultado a la respuesta de la UI y revalida la ficha (y el buscador). Sin propiedad
 * (Mi empresa), revalida todas las rutas de propiedades.
 */
function done<E extends ExpectedError>(
  result: Result<unknown, E>,
  messages: Partial<ErrorMessages<E>>,
  propertyId: string | undefined,
): ActionResult {
  if (result.isErr()) return actionFailed(messageForError(result.error, messages));
  if (propertyId === undefined) revalidatePath('/propiedades', 'layout');
  else revalidatePath(`/propiedades/${propertyId}`);
  revalidatePath('/propiedades');
  revalidatePath('/mi-empresa', 'layout');
  return ACTION_OK;
}

// ---------- Datos de la ficha ----------

export async function updatePropertyLocationAction(
  input: UpdatePropertyLocationInput,
): Promise<ActionResult & { readonly geocoding?: GeocodingOutcome | 'unchanged' }> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyLocationInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyLocation.execute(parsed.data, actor);
  const response = done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
  return result.isOk() ? { ...response, geocoding: result.value.geocoding } : response;
}

export async function changePropertyCodeAction(
  input: ChangePropertyCodeInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangePropertyCodeInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().changePropertyCode.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function updatePropertyOperationsAction(
  input: UpdatePropertyOperationsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyOperationsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyOperations.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function changePropertyStatusAction(
  input: ChangePropertyStatusInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangePropertyStatusInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().changePropertyStatus.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function updatePropertyCharacteristicsAction(
  input: UpdatePropertyCharacteristicsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyCharacteristicsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyCharacteristics.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function updatePropertyDealAction(
  input: UpdatePropertyDealInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyDealInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyDeal.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function updatePropertyFeaturesAction(
  input: UpdatePropertyFeaturesInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyFeaturesInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyFeatures.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function updatePropertyDescriptionAction(
  input: UpdatePropertyDescriptionInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyDescriptionInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyDescription.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function updatePropertyCustomAttributesAction(
  input: UpdatePropertyCustomAttributesInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyCustomAttributesInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyCustomAttributes.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function changePropertyTagsAction(
  input: ChangePropertyTagsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangePropertyTagsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().changePropertyTags.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function changePropertyProducerAction(
  input: ChangePropertyProducerInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangePropertyProducerInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().changePropertyProducer.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function updatePropertyInternalInfoAction(
  input: UpdatePropertyInternalInfoInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyInternalInfoInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyInternalInfo.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function updatePropertyPublicationAction(
  input: UpdatePropertyPublicationInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdatePropertyPublicationInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().updatePropertyPublication.execute(parsed.data, actor);
  return done(result, DETAIL_ERROR_MESSAGES, parsed.data.propertyId);
}

// ---------- PDF ----------

export async function requestPropertyDocumentAction(
  input: RequestPropertyDocumentInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RequestPropertyDocumentInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DOCUMENT_ERROR_MESSAGES.InvalidInput);
  const result = await properties().requestPropertyDocument.execute(parsed.data, actor);
  return done(result, DOCUMENT_ERROR_MESSAGES, parsed.data.propertyId);
}

export async function sendOwnerReportAction(
  propertyId: string,
  input: SendOwnerReportInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SendOwnerReportInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DOCUMENT_ERROR_MESSAGES.InvalidInput);
  const result = await properties().sendOwnerReport.execute(parsed.data, actor);
  return done(result, DOCUMENT_ERROR_MESSAGES, propertyId);
}

/** Los PDF de la ficha: la pantalla los vuelve a pedir mientras alguno se está armando. */
export async function loadPropertyDocumentsAction(
  propertyId: string,
): Promise<
  | { readonly ok: true; readonly value: readonly PropertyDocumentRow[] }
  | { readonly ok: false; readonly message: string }
> {
  const { actor } = await requireSession();
  const parsed = ListPropertyDocumentsQuerySchema.safeParse({ propertyId, pageSize: 10 });
  if (!parsed.success) return { ok: false, message: DETAIL_LIST_ERROR_MESSAGES.InvalidInput };
  const result = await properties().listPropertyDocuments.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, DETAIL_LIST_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value.items };
}

// ---------- Mi empresa: atributos personalizados ----------

export async function createCustomAttributeAction(
  input: CreateCustomAttributeInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateCustomAttributeInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CUSTOM_ATTRIBUTE_ERROR_MESSAGES.InvalidInput);
  const result = await properties().createCustomAttribute.execute(parsed.data, actor);
  return done(result, CUSTOM_ATTRIBUTE_ERROR_MESSAGES, undefined);
}

export async function updateCustomAttributeAction(
  input: UpdateCustomAttributeInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateCustomAttributeInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CUSTOM_ATTRIBUTE_ERROR_MESSAGES.InvalidInput);
  const result = await properties().updateCustomAttribute.execute(parsed.data, actor);
  return done(result, CUSTOM_ATTRIBUTE_ERROR_MESSAGES, undefined);
}
