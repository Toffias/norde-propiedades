# CLAUDE.md: apps/gestion

Panel interno del equipo de Norde (Next.js App Router). Detalle funcional en [docs/modulos/03-sistema-gestion.md](../../docs/modulos/03-sistema-gestion.md).

Se aplica además del `CLAUDE.md` de la raíz.

## Es una capa de presentación

Esta app **no tiene lógica de negocio**. Muestra datos y llama a casos de uso de `@norde/core`.

```
src/
├── app/                      # Rutas de Next.js (layouts, pages). Delgadas: componen features
├── features/<module>/        # Por módulo del core: components/, actions.ts, queries.ts
├── lib/                      # Utilidades de presentación (formatters, auth de sesión)
├── config/env.ts             # Único lugar que lee process.env
└── container.ts              # Composition root: arma casos de uso con infra. Único que importa @norde/infra
```

## Reglas

- **Server Actions** (`features/<module>/actions.ts`), siempre en este orden:
  1. Obtienen el `Actor` de la sesión.
  2. Validan el input con el **contract Zod** del core.
  3. Llaman **un** caso de uso.
  4. Mapean el `Result` a una respuesta de UI.
  5. Revalidan la ruta.
  - Nada más. Si una action tiene un `if` de negocio, está mal ubicada.
- **Lecturas** en Server Components, llamando queries del core a través de `container.ts`.
- **Componentes cliente**: nunca importan `@norde/core` salvo `contracts/` (schemas y tipos), ni `@norde/infra`.
- **Formularios**: react-hook-form + `zodResolver` con el **mismo** contract del core. No duplicar schemas.
- **Tablas**: TanStack Table. Paginación, filtros y orden **del lado del servidor** (query params). Nunca traer todo a memoria.
- **Autorización**:
  - La decide el caso de uso.
  - La UI puede ocultar acciones según permisos, pero **nunca** es la única barrera.
  - Toda ruta bajo `(panel)` exige sesión.
- **Errores**: cada tipo de error de un `Result` se mapea a un mensaje en español claro para el usuario. Los errores inesperados muestran un mensaje genérico y se loguean.
- **UI**: componentes de `@norde/ui` y tokens semánticos (`bg-card`, `text-foreground`). Sin colores hardcodeados. Verificar mobile y desktop, tema claro y oscuro.
- Textos de UI en español rioplatense ("vos").

## Tests

- Server Actions críticas (crear o editar propiedad, cliente, contrato): test de integración.
- Flujos clave con Playwright: login, cargar propiedad, tomar una conversación del bot.
