import { getEnv } from '../../../../../config/env';
import { getLogger } from '../../../../../config/logger';
import { getContainer } from '../../../../../container';
import { createMercadoLibreNotificationHandler } from '../../../../../features/portals/mercadolibre-notification-handler';

// Endpoint público: MercadoLibre lo llama con sus notificaciones (#14, ADR 0032 y 0035). Se
// configura en la app de MercadoLibre, con los tópicos `vis_leads` e `items`.

/**
 * ML manda una notificación por contacto, por cada cambio de un aviso y por cada reintento: un
 * minuto normal no llega a esto.
 */
const RATE_PER_MINUTE = 240;

let handler: ((request: Request) => Promise<Response>) | undefined;

/** Se arma al primer pedido (no en build) y se reutiliza: el rate limit vive en el proceso. */
function mercadoLibreNotificationHandler(applicationId: string) {
  handler ??= createMercadoLibreNotificationHandler({
    applicationId,
    ratePerMinute: RATE_PER_MINUTE,
    notify: async (userId) => {
      const portals = getContainer().portals;
      if (!portals) throw new Error('Portals are disabled but MercadoLibre notifications arrive');
      return portals.notifyMercadoLibreLeads(userId);
    },
    notifyItem: async (userId, itemId) => {
      const portals = getContainer().portals;
      if (!portals) throw new Error('Portals are disabled but MercadoLibre notifications arrive');
      return portals.notifyMercadoLibreItem(userId, itemId);
    },
    logger: getLogger().child({ component: 'mercadolibre-notifications' }),
    now: () => Date.now(),
  });
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  // Sin portales o sin la app de MercadoLibre configurada, el endpoint no se expone.
  if (!env.PORTALS_ENABLED || !env.MERCADOLIBRE_CLIENT_ID) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  return mercadoLibreNotificationHandler(env.MERCADOLIBRE_CLIENT_ID)(request);
}
