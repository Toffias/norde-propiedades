import { getEnv } from '../../../../../config/env';
import { getLogger } from '../../../../../config/logger';
import { getContainer } from '../../../../../container';
import { createWebSubscriptionHandler } from '../../../../../features/clients/web-subscription-handler';

// Endpoint público: lo llama apps/web cuando alguien pide suscribirse a una búsqueda (#208).

let handler: ((request: Request) => Promise<Response>) | undefined;

/** Se arma al primer pedido (no en build) y se reutiliza: el rate limit vive en el proceso. */
function webSubscriptionHandler(
  secret: string,
  ratePerMinute: number,
  signedRatePerMinute: number,
) {
  handler ??= createWebSubscriptionHandler({
    secret,
    ratePerMinute,
    signedRatePerMinute,
    request: (input) => getContainer().webSubscriptions.request(input),
    logger: getLogger().child({ component: 'web-subscription-webhook' }),
    now: () => Date.now(),
  });
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  // Comparte el secreto de las consultas: sin él, el webhook no se expone.
  if (!env.INQUIRY_WEBHOOK_SECRET) return Response.json({ error: 'not found' }, { status: 404 });
  return webSubscriptionHandler(
    env.INQUIRY_WEBHOOK_SECRET,
    env.INQUIRY_WEBHOOK_RATE_PER_MINUTE,
    env.INQUIRY_WEBHOOK_SIGNED_RATE_PER_MINUTE,
  )(request);
}
