import config from '@payload-config';
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { getPayload } from 'payload';
import { z } from 'zod';

import { isSafeRelativePath } from '../../../../lib/seo/safe-path';

const QuerySchema = z.object({ path: z.string().refine(isSafeRelativePath) });

/**
 * Activa el draft mode para ver borradores (botón "Vista previa" y live preview del admin).
 * La autorización es la sesión de Payload: solo un editor logueado puede activarlo.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const query = QuerySchema.safeParse({ path: request.nextUrl.searchParams.get('path') });
  if (!query.success) return new Response('Ruta de preview inválida', { status: 400 });

  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  const draft = await draftMode();

  if (!user) {
    draft.disable();
    return new Response('Iniciá sesión en el admin para ver la vista previa', { status: 403 });
  }

  draft.enable();
  redirect(query.data.path);
}
