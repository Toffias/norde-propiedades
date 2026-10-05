import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getEnv } from '../../../../../config/env';
import { getLogger } from '../../../../../config/logger';
import { getContainer } from '../../../../../container';
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  completeConnection,
  connectionResultPath,
  decodePendingConnection,
} from '../../../../../features/portals/oauth-flow';
import { getSession } from '../../../../../lib/session';

// Vuelta de MercadoLibre después de autorizar: es la URL registrada en la app
// (`MERCADOLIBRE_REDIRECT_URI`). Conecta la cuenta y vuelve a Mi empresa → Portales.

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const session = await getSession();
  if (session.isErr()) return NextResponse.redirect(new URL('/ingresar', env.BETTER_AUTH_URL));
  const portals = getContainer().portals;
  if (!portals) return new Response(null, { status: 404 });

  const pending = decodePendingConnection((await cookies()).get(OAUTH_COOKIE)?.value);
  const { actor } = session.value;
  const { portal, outcome } = await completeConnection({
    params: new URL(request.url).searchParams,
    pending,
    connect: (input) => portals.connectAccount.execute(input, actor),
  });
  getLogger().info({ portal, outcome, userId: actor.id }, 'Portal connection finished');

  const response = NextResponse.redirect(
    new URL(connectionResultPath(outcome), env.BETTER_AUTH_URL),
  );
  // De un solo uso: el `state` y el verificador no sirven para otra vuelta.
  response.cookies.delete({ name: OAUTH_COOKIE, path: OAUTH_COOKIE_PATH });
  return response;
}
