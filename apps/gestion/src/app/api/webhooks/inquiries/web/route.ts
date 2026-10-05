import { getEnv } from '../../../../../config/env';
import { getLogger } from '../../../../../config/logger';
import { getContainer } from '../../../../../container';
import { createWebInquiryHandler } from '../../../../../features/inquiries/web-inquiry-handler';

// Endpoint público: lo llama apps/web por cada envío del formulario de contacto (#10, ADR 0021).

let handler: ((request: Request) => Promise<Response>) | undefined;

/** Se arma al primer pedido (no en build) y se reutiliza: el rate limit vive en el proceso. */
function webInquiryHandler(secret: string, ratePerMinute: number) {
  handler ??= createWebInquiryHandler({
    secret,
    ratePerMinute,
    receive: (input) => getContainer().webInquiries.receive(input),
    logger: getLogger().child({ component: 'web-inquiry-webhook' }),
    now: () => Date.now(),
  });
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  // Sin secreto configurado, el webhook no se expone.
  if (!env.INQUIRY_WEBHOOK_SECRET) return Response.json({ error: 'not found' }, { status: 404 });
  return webInquiryHandler(
    env.INQUIRY_WEBHOOK_SECRET,
    env.INQUIRY_WEBHOOK_RATE_PER_MINUTE,
  )(request);
}
