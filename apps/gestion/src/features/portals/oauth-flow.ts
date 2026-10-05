import type { ConnectPortalAccountError } from '@norde/core/portals';
import {
  PortalSchema,
  type ConnectPortalAccountInput,
  type PortalValue,
} from '@norde/core/portals/contracts';
import type { Result } from '@norde/core/shared';
import { z } from 'zod';

// Conexión de una cuenta de portal por OAuth: lo que el panel guarda entre la ida al portal y la
// vuelta, y cómo se resuelve la vuelta. Sin Next: las rutas solo leen la cookie y redirigen.

/** Cookie con el `state` y el verificador PKCE, mientras el usuario autoriza en el portal. */
export const OAUTH_COOKIE = 'norde_portal_oauth';
/** Solo la leen las rutas de portales. */
export const OAUTH_COOKIE_PATH = '/api/portals';
/** Diez minutos para autorizar; después hay que empezar de nuevo. */
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

/** Página a la que vuelve el usuario, con el resultado en `?conexion=`. */
export const PORTALS_SETTINGS_PATH = '/mi-empresa/portales';
export const CONNECTION_PARAM = 'conexion';

const PendingConnectionSchema = z.object({
  portal: PortalSchema,
  state: z.string().min(1),
  codeVerifier: z.string().min(43),
});

export type PendingConnection = z.infer<typeof PendingConnectionSchema>;

export function encodePendingConnection(pending: PendingConnection): string {
  return Buffer.from(JSON.stringify(pending), 'utf8').toString('base64url');
}

/** La conexión pendiente guardada en la cookie, o `undefined` si falta o no es válida. */
export function decodePendingConnection(value: string | undefined): PendingConnection | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = PendingConnectionSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    // JSON roto: una cookie vieja o adulterada se trata como si no estuviera.
    return undefined;
  }
}

/** Cómo terminó la conexión: `ok` o el tipo de error, para el mensaje de la página. */
export type ConnectionOutcome =
  'ok' | 'AuthorizationDenied' | 'ValidationFailed' | ConnectPortalAccountError['type'];

/**
 * La vuelta del portal: con la cookie de la ida, canjea el código. Si el usuario no autorizó, el
 * portal vuelve con `?error=`; sin cookie (vencida u otra pestaña), el `state` no se puede validar.
 */
export async function completeConnection(input: {
  readonly params: URLSearchParams;
  readonly pending: PendingConnection | undefined;
  readonly connect: (
    input: ConnectPortalAccountInput,
  ) => Promise<Result<unknown, ConnectPortalAccountError>>;
}): Promise<{ readonly portal: PortalValue | undefined; readonly outcome: ConnectionOutcome }> {
  const { params, pending } = input;
  if (pending === undefined) return { portal: undefined, outcome: 'InvalidAuthorizationState' };
  if (params.has('error')) return { portal: pending.portal, outcome: 'AuthorizationDenied' };

  const code = params.get('code');
  const state = params.get('state');
  if (code === null || state === null)
    return { portal: pending.portal, outcome: 'ValidationFailed' };

  const result = await input.connect({
    portal: pending.portal,
    code,
    state,
    expectedState: pending.state,
    codeVerifier: pending.codeVerifier,
  });
  return { portal: pending.portal, outcome: result.isOk() ? 'ok' : result.error.type };
}

/** La URL de Mi empresa → Portales con el resultado de la conexión. */
export function connectionResultPath(outcome: ConnectionOutcome): string {
  return `${PORTALS_SETTINGS_PATH}?${new URLSearchParams({ [CONNECTION_PARAM]: outcome }).toString()}`;
}
