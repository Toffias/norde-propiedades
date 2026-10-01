# ADR 0016: Ingreso al panel con Better Auth, sesión resuelta por el core

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

`docs/arquitectura.md` eligió Better Auth para el panel, y #19 dejó sus tablas en `identity` (`users`, `sessions`, `accounts`, `verifications`) junto con los roles y permisos del sistema (ADR 0015). Faltaba definir por dónde pasa el ingreso, cómo se arma el `Actor` y quién audita lo que no pasa por un caso de uso.

Tres datos de Better Auth 1.7 condicionan el diseño:

- El rate limit solo corre en su handler HTTP. Una llamada directa a `auth.api.signInEmail` desde una Server Action no lo aplica.
- Los hooks (`hooks.before/after`, `databaseHooks`) corren en las dos vías.
- La regla de permisos efectivos (roles + `grant` − `deny`) y el estado del usuario son de negocio y viven en `identity`.

## Decisión

- **El ingreso pasa por el handler de Better Auth** (`/api/auth/sign-in/email`), llamado desde el formulario con `better-auth/react`. Así aplican el rate limit (5 intentos por minuto por IP en el ingreso) y los hooks. No hay Server Action de login.
- **Alta pública deshabilitada** (`disableSignUp`). Hasta el ABM de #3, los usuarios se crean con `pnpm user:create-admin` (producción) y `pnpm db:seed` (desarrollo).
- **Auditoría en hooks de Better Auth** (`packages/infra/src/identity/better-auth.ts`):
  - Se registran `user.signed-in`, `user.sign-in-failed` (con el código de error) y `user.signed-out`.
  - Un intento con un email inexistente solo se loguea, sin el email.
- **Un usuario suspendido no obtiene sesión**: `databaseHooks.session.create.before` usa `canSignIn` del dominio.
- **El `Actor` lo arma el core** en cada request: `ResolveSessionActor` (`identity`) lee el usuario, sus roles y sus permisos propios, aplica `effectivePermissions` y rechaza a los suspendidos.
  - `Actor.user` recibe aparte los permisos denegados, que ganan también sobre un `recurso:*`.
  - La app solo lee el ID de usuario de la sesión (`BetterAuthSessionReader`).
- **`proxy.ts` es un chequeo optimista**: solo mira que exista la cookie. La barrera real es `requireSession()` en el layout de `(panel)` y la autorización de cada caso de uso.
- **Roles de sistema por migración** (`0002_system_roles`): Administrador, Gerente / Broker, Agente / Asesor y Administrativo de alquileres, con permisos por recurso. Son el punto de partida: se ajustan desde #3 sin tocar código.
- IDs de Better Auth con nuestro `IdGenerator` (UUID v7).

## Consecuencias

- El rate limit es en memoria: alcanza con un proceso del panel. Con varias instancias hay que pasar a `storage: 'database'` (tabla nueva) o a un store compartido.
- `last_login_at` todavía no se actualiza: queda para el ABM de usuarios (#3).
- No hay recupero de contraseña por mail hasta tener el envío de mails. Mientras tanto, la blanquea un administrador.
- Cambiar de proveedor de autenticación toca `infra/identity`, el handler y el cliente del formulario. El core y los casos de uso no cambian.
