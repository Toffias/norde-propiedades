import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

// Chequeo optimista: sin cookie de sesión, al login sin renderizar nada. No valida la sesión;
// la barrera real es `requireSession()` en el layout de `(panel)` y la autorización de cada
// caso de uso.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL('/ingresar', request.url);
  const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (destination !== '/') signIn.searchParams.set('volver', destination);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Todo menos el login, la API de auth, las pantallas de desarrollo y los archivos estáticos.
  matcher: ['/((?!ingresar|api/auth|dev|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)'],
};
