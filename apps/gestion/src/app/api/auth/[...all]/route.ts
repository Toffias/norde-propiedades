import { getContainer } from '../../../../container';

// Endpoints de Better Auth: ingreso, salida y sesión. Pasan por acá (y no por Server Actions)
// para que apliquen el rate limit y los hooks de auditoría.
// El container se arma en el request, no al importar el módulo: el build no tiene base.

export function GET(request: Request): Promise<Response> {
  return getContainer().handleAuthRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return getContainer().handleAuthRequest(request);
}
