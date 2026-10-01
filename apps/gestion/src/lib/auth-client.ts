import { createAuthClient } from 'better-auth/react';

/** Cliente de Better Auth para el navegador: habla con `/api/auth` del mismo origen. */
export const authClient = createAuthClient();
