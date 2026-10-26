import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Cliente de Better Auth para el navegador: habla con `/api/auth` del mismo origen. Con la
 * verificación en dos pasos activa, `signIn.email` devuelve `twoFactorRedirect` y el login pide el
 * código en la misma pantalla.
 */
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });
