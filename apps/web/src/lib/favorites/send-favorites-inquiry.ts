'use server';

import { getLogger } from '../../config/logger';
import { getContainer } from '../../container';
import { clientRateKey } from '../client-ip';
import { allowInquiries } from '../inquiries/inquiry-limit';
import { favoriteExternalId } from './external-id';
import {
  favoritesFormValues,
  favoritesInquiryMessage,
  parseFavoritesForm,
  type FavoritesFormState,
} from './favorites-form';

const UNAVAILABLE =
  'No pudimos enviar tu consulta. Probá de nuevo en unos minutos o escribinos por WhatsApp.';

/**
 * Server Action del panel de favoritos: manda al panel una consulta por cada propiedad, con los
 * mismos datos de contacto (ADR 0021). Así cada una entra como cualquier consulta de una ficha:
 * reglas de asignación por propiedad, conversión a contacto y oportunidad, historial en la ficha.
 */
export async function sendFavoritesInquiry(
  _previous: FavoritesFormState,
  form: FormData,
): Promise<FavoritesFormState> {
  const parsed = parseFavoritesForm(form);
  // A un bot se le responde como si hubiera salido bien: así no aprende a esquivar la trampa.
  if (parsed.kind === 'bot') return { status: 'sent' };
  if (parsed.kind === 'invalid') return parsed.state;
  const failed = (message: string): FavoritesFormState => ({
    status: 'error',
    message,
    values: favoritesFormValues(form),
  });

  const { email, phone, message, propertyIds, submissionId, name } = parsed.data;
  // Cada favorito es una consulta en el panel: cuenta como tal en el límite.
  if (!allowInquiries(await clientRateKey(), propertyIds.length)) {
    return failed('Recibimos varias consultas seguidas. Esperá unos minutos y volvé a intentar.');
  }
  const sender = getContainer().inquiries;
  if (!sender) return failed(UNAVAILABLE);

  const logger = getLogger().child({ component: 'favorites-form' });
  const text = favoritesInquiryMessage(message, propertyIds.length);
  try {
    // De a una: el panel deduplica por `externalId`, y en orden el log dice dónde se cortó.
    for (const propertyId of propertyIds) {
      const outcome = await sender.send({
        externalId: favoriteExternalId(submissionId, propertyId),
        name,
        message: text,
        propertyId,
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
      });
      switch (outcome.kind) {
        case 'received':
          continue;
        case 'busy':
          return failed(UNAVAILABLE);
        case 'rejected':
          logger.info({ reason: outcome.reason }, 'Favorites inquiry rejected by gestion');
          return failed('Revisá el teléfono y el email: no los pudimos validar.');
      }
    }
    return { status: 'sent' };
  } catch (error) {
    logger.error({ err: error }, 'Favorites inquiry could not be sent');
    return failed(UNAVAILABLE);
  }
}
