import { PortalInputSchema } from '@norde/core/portals/contracts';
import { NextResponse } from 'next/server';

import { getEnv } from '../../../../../config/env';
import { getContainer } from '../../../../../container';
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_COOKIE_PATH,
  connectionResultPath,
  encodePendingConnection,
} from '../../../../../features/portals/oauth-flow';
import { getSession } from '../../../../../lib/session';

// Ida a MercadoLibre para conectar una cuenta (`?portal=mercadolibre|mercadolibre_developments`).
// Guarda el `state` y el verificador PKCE en una cookie httpOnly hasta la vuelta (`../callback`).

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const back = (path: string) => NextResponse.redirect(new URL(path, env.BETTER_AUTH_URL));
  const session = await getSession();
  if (session.isErr()) return back('/ingresar');
  const portals = getContainer().portals;
  if (!portals) return new Response(null, { status: 404 });

  const parsed = PortalInputSchema.safeParse({
    portal: new URL(request.url).searchParams.get('portal'),
  });
  if (!parsed.success) return back(connectionResultPath('ValidationFailed'));

  const result = await portals.startConnection.execute(parsed.data, session.value.actor);
  if (result.isErr()) return back(connectionResultPath(result.error.type));

  const { url, state, codeVerifier } = result.value;
  const response = NextResponse.redirect(url);
  response.cookies.set(
    OAUTH_COOKIE,
    encodePendingConnection({ portal: parsed.data.portal, state, codeVerifier }),
    {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      // `lax`: la cookie viaja en la vuelta, que es una navegación desde MercadoLibre.
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    },
  );
  return response;
}
