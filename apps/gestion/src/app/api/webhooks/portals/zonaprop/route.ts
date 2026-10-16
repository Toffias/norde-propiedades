import { ZONAPROP_CALLBACK_HEADER, getEnv } from '../../../../../config/env';
import { getLogger } from '../../../../../config/logger';
import { getContainer } from '../../../../../container';
import { createZonapropCallbackHandler } from '../../../../../features/portals/zonaprop-callback-handler';

// Endpoint público: Zonaprop lo llama cuando llega un contacto a un aviso (#14, ADR 0029).

/** Zonaprop avisa por cada contacto: un minuto de muchas consultas no llega a esto. */
const RATE_PER_MINUTE = 120;

let handler: ((request: Request) => Promise<Response>) | undefined;

/** Se arma al primer pedido (no en build) y se reutiliza: el rate limit vive en el proceso. */
function zonapropCallbackHandler(token: string) {
  handler ??= createZonapropCallbackHandler({
    token,
    header: ZONAPROP_CALLBACK_HEADER,
    ratePerMinute: RATE_PER_MINUTE,
    notify: async () => {
      const portals = getContainer().portals;
      if (!portals) throw new Error('Portals are disabled but the Zonaprop callback is configured');
      return portals.notifyZonapropLeads();
    },
    logger: getLogger().child({ component: 'zonaprop-callback' }),
    now: () => Date.now(),
  });
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  // Sin portales o sin token configurado, el endpoint no se expone.
  if (!env.PORTALS_ENABLED || !env.ZONAPROP_CALLBACK_TOKEN) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  return zonapropCallbackHandler(env.ZONAPROP_CALLBACK_TOKEN)(request);
}
