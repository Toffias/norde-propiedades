import { z } from 'zod';

import { verifySignature } from '../signature';
import { PROPERTIES_CACHE_TAG, propertyCacheTag } from './cache';

export const REVALIDATE_SIGNATURE_HEADER = 'x-norde-signature';

/** Un aviso es un ID: lo que pese más no lo mandó apps/gestion. */
const BODY_LIMIT_BYTES = 1024;

const RevalidateBodySchema = z.object({ propertyId: z.uuid() });

/**
 * `POST /api/revalidate`: apps/gestion avisa que una propiedad cambió (ADR 0023). Con la firma
 * válida, invalida su ficha y los listados.
 */
export function createRevalidateHandler(options: {
  /** Compartido con `WEB_REVALIDATE_SECRET` de apps/gestion. */
  readonly secret: string;
  readonly revalidateTag: (tag: string) => void;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > BODY_LIMIT_BYTES) return tooLarge();
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.byteLength > BODY_LIMIT_BYTES) return tooLarge();
    const signature = request.headers.get(REVALIDATE_SIGNATURE_HEADER);
    if (!verifySignature(raw, signature, options.secret)) {
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    }

    const parsed = RevalidateBodySchema.safeParse(parseJson(raw));
    if (!parsed.success) return Response.json({ error: 'invalid body' }, { status: 400 });
    options.revalidateTag(propertyCacheTag(parsed.data.propertyId));
    options.revalidateTag(PROPERTIES_CACHE_TAG);
    return Response.json({ revalidated: true });
  };
}

function tooLarge(): Response {
  return Response.json({ error: 'too large' }, { status: 413 });
}

function parseJson(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
