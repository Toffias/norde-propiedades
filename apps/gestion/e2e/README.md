# Tests e2e del panel

Playwright contra el panel levantado en el puerto **3011**, con una base propia que se recrea en cada corrida. Decisión y motivos en el [ADR 0025](../../../docs/adr/0025-tests-e2e-del-panel-con-playwright.md).

## Correrlos

Una sola vez, el navegador:

```bash
pnpm --filter @norde/gestion exec playwright install chromium
```

Cada vez:

```bash
pnpm --filter @norde/gestion test:e2e
```

Con la interfaz de Playwright, para ver y depurar cada paso:

```bash
pnpm --filter @norde/gestion test:e2e:ui
```

`test:e2e` primero corre `pnpm --filter @norde/scripts db:e2e-reset`, que:

1. Crea la base si falta.
2. Borra `core` y `pgboss`, aplica las migraciones y carga el seed (`scripts/db/seed/`).

Después Playwright levanta el panel y corre los specs.

## La base

El nombre tiene que terminar en `_e2e`: el reset se niega a tocar otra base. La URL sale de:

1. `E2E_DATABASE_URL`, si está definida.
2. El `DATABASE_URL` de `apps/gestion/.env` con el sufijo `_e2e` (por ejemplo, `norde` → `norde_e2e`).
3. Si no hay `.env`, `postgres://norde:norde@localhost:5432/norde_e2e`.

El usuario de la base necesita permiso para crear bases (`CREATEDB`), igual que para `db:setup`.

## El servidor

- En local, `next dev`. Si ya hay un panel corriendo en el 3011, Playwright lo reusa: tiene que apuntar a la base e2e.
- En CI, o con `E2E_SERVER=start`, sirve el build de producción. Hace falta `pnpm --filter @norde/gestion build` antes.
- El entorno lo fija `playwright.config.ts`, así el `.env` local no prende mail, portales ni webhooks. Los jobs corren.

## Escribir un spec

- Un archivo por módulo o flujo: `e2e/<modulo>.spec.ts`. Los que corren en el celular terminan en `.mobile.spec.ts`.
- Sesión: `test.use({ storageState: storageStateFor('agent') })`. Los cuatro roles del seed (`admin`, `manager`, `agent`, `rentals-admin`) ingresan una vez en `auth.setup.ts`.
  - No ingreses desde un spec: en producción hay un límite de 5 ingresos por minuto.
  - No cierres la sesión guardada: la usan los demás specs. Para probar el cierre, ingresá con una sesión nueva.
- Datos: los del seed son de solo lectura. Lo que un spec crea o cambia, lo crea él con un nombre único (por ejemplo, con `test.info().testId`), para que los specs corran en paralelo y en cualquier orden.
- Selectores: por rol y texto visible (`getByRole`, `getByLabel`), como los usa una persona. Nada de clases de CSS.
