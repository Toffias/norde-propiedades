'use server';

import { getLogger } from '../../config/logger';
import { getContainer } from '../../container';
import { clientIp } from '../client-ip';
import { parseListingFilters, type SearchParamsRecord } from '../properties/listing-filters';
import { findLocations } from '../properties/queries';
import { createRateLimiter } from '../rate-limit';

import { subscriptionCriteria, subscriptionSummary } from './search-subscription';
import { parseSubscribeForm, subscribeFormValues, type SubscribeFormState } from './subscribe-form';

/** La query string del listado como la recibe la página: los repetidos (`tipo=a&tipo=b`), en lista. */
function searchParamsRecord(query: string): SearchParamsRecord {
  const record: Record<string, string[]> = {};
  for (const [key, value] of new URLSearchParams(query)) (record[key] ??= []).push(value);
  return record;
}

/** Pedidos de suscripción por IP cada 10 minutos. */
const allow = createRateLimiter(5, () => Date.now());

const UNAVAILABLE =
  'No pudimos registrar tu suscripción. Probá de nuevo en unos minutos o escribinos por WhatsApp.';

/**
 * Server Action de "Suscribirme a esta búsqueda" (#208): arma la búsqueda con los filtros del
 * listado y la manda al panel, que le escribe a la persona para que confirme su email.
 */
export async function subscribeToSearch(
  _previous: SubscribeFormState,
  form: FormData,
): Promise<SubscribeFormState> {
  const parsed = parseSubscribeForm(form);
  // A un bot se le responde como si hubiera salido bien: así no aprende a esquivar la trampa.
  if (parsed.kind === 'bot') return { status: 'sent' };
  if (parsed.kind === 'invalid') return parsed.state;
  const failed = (
    message: string,
    fieldErrors?: NonNullable<Extract<SubscribeFormState, { status: 'error' }>['fieldErrors']>,
  ): SubscribeFormState => ({
    status: 'error',
    message,
    ...(fieldErrors && { fieldErrors }),
    values: subscribeFormValues(form),
  });

  const { name, email, frequency, search } = parsed.data;
  // Los filtros se vuelven a leer de la búsqueda, como en el listado: un valor inválido se ignora.
  const listed = parseListingFilters(searchParamsRecord(search));
  const operation = listed.operation ?? parsed.data.operation;
  if (operation === undefined) {
    return failed('Revisá los datos marcados.', {
      operation: 'Elegí si buscás comprar o alquilar.',
    });
  }
  const criteria = subscriptionCriteria({ ...listed, operation });

  if (!allow(await clientIp())) {
    return failed('Recibimos varios pedidos seguidos. Esperá unos minutos y volvé a intentar.');
  }
  const sender = getContainer().subscriptions;
  if (!sender) return failed(UNAVAILABLE);

  const logger = getLogger().child({ component: 'search-subscription-form' });
  try {
    const locations = await findLocations(criteria.locationIds);
    const outcome = await sender.send({
      name,
      email,
      frequency,
      summary: subscriptionSummary(
        { ...criteria, operation },
        locations.map((location) => location.name),
      ),
      operation,
      propertyTypes: criteria.propertyTypes,
      // Solo las ubicaciones que siguen en el catálogo.
      locationIds: locations.map((location) => location.id),
      ...(criteria.currency !== undefined && { currency: criteria.currency }),
      ...(criteria.minPrice !== undefined && { minPrice: String(criteria.minPrice) }),
      ...(criteria.maxPrice !== undefined && { maxPrice: String(criteria.maxPrice) }),
      ...(criteria.minRooms !== undefined && { minRooms: criteria.minRooms }),
    });
    switch (outcome.kind) {
      case 'requested':
        return { status: 'sent' };
      case 'busy':
        return failed(UNAVAILABLE);
      case 'rejected':
        logger.info({ reason: outcome.reason }, 'Search subscription rejected by gestion');
        return failed('Revisá el email: no lo pudimos validar.', { email: 'Revisá el email.' });
    }
  } catch (error) {
    logger.error({ err: error }, 'Search subscription could not be sent');
    return failed(UNAVAILABLE);
  }
}
