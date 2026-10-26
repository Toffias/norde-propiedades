import { UNEXPECTED_ERROR_MESSAGE } from '../../lib/errors';

// Reglas de presentación del login: a dónde volver y qué decir cuando no se pudo entrar.

/** Origen ficticio para resolver el destino como lo hace el navegador. */
const PANEL_ORIGIN = 'https://panel.invalid';

/**
 * Destino después de entrar (`?volver=/contactos?page=2`). Solo rutas del propio panel: un valor
 * como `//otro-sitio.com` o `https://…` sería un open redirect. Se resuelve como URL, igual que en
 * el navegador, que descarta tabs y saltos de línea: `/<tab>/otro-sitio.com` es `//otro-sitio.com`.
 */
export function safeReturnPath(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.startsWith('/')) return '/';
  const url = URL.parse(value, PANEL_ORIGIN);
  if (url?.origin !== PANEL_ORIGIN) return '/';
  if (url.pathname.startsWith('/ingresar')) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface SignInFailure {
  readonly status: number;
  readonly code?: string | undefined;
}

/**
 * Mensaje de un ingreso fallido. No distingue "email inexistente" de "contraseña incorrecta":
 * no se revela qué emails tienen cuenta.
 */
export function signInErrorMessage(failure: SignInFailure): string {
  if (failure.status === 429) return 'Demasiados intentos. Esperá un minuto y probá de nuevo.';
  // El hook que bloquea a los usuarios suspendidos impide crear la sesión.
  if (failure.code === 'FAILED_TO_CREATE_SESSION') {
    return 'Tu usuario no tiene acceso al panel. Hablá con un administrador.';
  }
  if (failure.status === 401 || failure.status === 400) return 'Email o contraseña incorrectos.';
  return UNEXPECTED_ERROR_MESSAGE;
}
