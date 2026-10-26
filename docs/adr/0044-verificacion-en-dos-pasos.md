# ADR 0044: Verificación en dos pasos con el plugin de Better Auth

- **Estado**: aceptada
- **Fecha**: 2026-10-25
- **Complementa**: ADR 0016 (identidad y permisos con Better Auth).

## Contexto

La issue #113 pide un segundo factor al ingresar al panel: alta, verificación y recuperación, con los ingresos fallidos y los cambios auditados. En #3 se había dejado para más adelante. Norde decidió que sea **opcional para todos los usuarios**, con app autenticadora y códigos de respaldo (sin mail ni WhatsApp).

## Decisión

- **Plugin `twoFactor` de Better Auth** (`packages/infra/src/identity/better-auth.ts`), no un caso de uso propio. Ya resuelve lo delicado: el secreto TOTP y los códigos de respaldo cifrados con el secreto de Better Auth, el desafío entre la contraseña y el código (cookie firmada de 10 minutos y 5 intentos), el bloqueo de la cuenta tras 10 códigos fallidos seguidos (15 minutos), el "confiar en este dispositivo" (30 días) y el rate limit de `/two-factor/*`.
  - Tabla `two_factors` (una fila por usuario) y columna `users.two_factor_enabled` (migración `0043`, solo expand).
  - Solo TOTP (`otpauth://`, emisor "Norde Gestión") y 10 códigos de respaldo de un uso. El método `otp` (código por mail o SMS) queda apagado.
- **Pantallas**:
  - `/mi-cuenta` (menú de la cuenta): activar (contraseña → QR o clave a mano → primer código → códigos de respaldo), generar códigos nuevos y desactivar, siempre con la contraseña.
  - `/ingresar`: si la contraseña es correcta y el usuario tiene el segundo factor, el mismo formulario pide el código de la app o uno de respaldo. Sin sesión hasta verificarlo.
- **Recuperación**: los códigos de respaldo; si también se perdieron, un administrador con `users:reset-password` quita el segundo factor desde Mi empresa → Usuarios (caso de uso `ResetUserTwoFactor`, que usa el puerto `CredentialStore`). Es el mismo permiso que el blanqueo de contraseña: los dos devuelven el acceso a una cuenta.
- **Auditoría**: lo que pasa por Better Auth se audita en un plugin propio (`norde-auth-audit`) que va **después** de `twoFactor`:
  - Los hooks `after` de `options.hooks` corren antes que los de los plugins, y recién después del de `twoFactor` se sabe si la contraseña dio sesión o quedó esperando el código. El ingreso se audita una sola vez, al final.
  - El usuario de un código se resuelve en el hook `before` (de la cookie del desafío o de la sesión abierta), antes de que el plugin consuma el desafío.
  - Acciones: `user.signed-in` (con `secondFactor: totp | backup-code` si hubo código), `user.sign-in-failed` (con el código de error y el factor), `user.two-factor-enabled`, `user.two-factor-disabled`, `user.two-factor-backup-codes-regenerated` y `user.two-factor-reset` (el administrador, desde el caso de uso).

## Consecuencias

- Activar o desactivar el segundo factor no pasa por un caso de uso del core: es configuración de autenticación, como el ingreso y la salida, y se audita igual.
- Desactivarlo pide una sesión de menos de un día (`sensitiveSessionMiddleware`); si es más vieja, el usuario vuelve a ingresar.
- Los tests de integración (`two-factor.int.test.ts`) cubren el flujo completo contra Postgres y fijan el orden de los hooks: si una versión nueva de Better Auth lo cambia, fallan.
- Obligarlo para algún rol (por ejemplo, administradores) es una regla nueva en `ResolveSessionActor`, como la contraseña temporal; no cambia el esquema.
