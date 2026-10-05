import { revalidateTag } from 'next/cache';

import { getEnv } from '../../../config/env';
import { createRevalidateHandler } from '../../../lib/properties/revalidate-handler';

// Avisos de apps/gestion cuando cambia una propiedad o su galería (ADR 0023), firmados con el
// secreto compartido. Sin secreto configurado, no se expone.

export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().REVALIDATE_SECRET;
  if (!secret) return Response.json({ error: 'not found' }, { status: 404 });
  return createRevalidateHandler({
    secret,
    revalidateTag: (tag) => {
      revalidateTag(tag, { expire: 0 });
    },
  })(request);
}
