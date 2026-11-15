import { z } from 'zod';

import { readLimitedBody } from '../read-limited-body';
import { verifyTimestampedSignature } from '../signature';
import {
  DEVELOPMENTS_CACHE_TAG,
  developmentCacheTag,
  PROPERTIES_CACHE_TAG,
  propertyCacheTag,
} from './cache';

export const REVALIDATE_SIGNATURE_HEADER = 'x-norde-signature';
export const REVALIDATE_TIMESTAMP_HEADER = 'x-norde-timestamp';

/** Un aviso es un ID: lo que pese más no lo mandó apps/gestion. */
const BODY_LIMIT_BYTES = 1024;

const RevalidateBodySchema = z.union([
  z.strictObject({ propertyId: z.uuid() }),
  z.strictObject({ developmentId: z.uuid() }),
]);

/**
 * `POST /api/revalidate`: apps/gestion avisa que una propiedad o un emprendimiento cambió (ADR
 * 0023). Con la firma válida, invalida su ficha y los listados, y avisa que la propiedad cambió
 * para precalentar sus fotos.
 */
export function createRevalidateHandler(options: {
  /** Compartido con `WEB_REVALIDATE_SECRET` de apps/gestion. */
  readonly secret: string;
  readonly revalidateTag: (tag: string) => void;
  /** No espera: lo que haga corre después de responder. */
  readonly onPropertyChanged?: (propertyId: string) => void;
  readonly now?: () => number;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const raw = await readLimitedBody(request, BODY_LIMIT_BYTES);
    if (raw === undefined) return tooLarge();
    const signed = verifyTimestampedSignature({
      rawBody: raw,
      timestamp: request.headers.get(REVALIDATE_TIMESTAMP_HEADER),
      signature: request.headers.get(REVALIDATE_SIGNATURE_HEADER),
      secret: options.secret,
      now: (options.now ?? Date.now)(),
    });
    if (!signed) {
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    }

    const parsed = RevalidateBodySchema.safeParse(parseJson(raw));
    if (!parsed.success) return Response.json({ error: 'invalid body' }, { status: 400 });
    if ('propertyId' in parsed.data) {
      options.revalidateTag(propertyCacheTag(parsed.data.propertyId));
      options.revalidateTag(PROPERTIES_CACHE_TAG);
      options.onPropertyChanged?.(parsed.data.propertyId);
    } else {
      options.revalidateTag(developmentCacheTag(parsed.data.developmentId));
      options.revalidateTag(DEVELOPMENTS_CACHE_TAG);
    }
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
