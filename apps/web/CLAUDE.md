# CLAUDE.md: apps/web

Sitio público de Norde: Next.js + Payload CMS. Detalle funcional en [docs/modulos/02-web-diseno-seo.md](../../docs/modulos/02-web-diseno-seo.md). Base: `C:\DS-DESIGN-Landing`.

Se aplica además del `CLAUDE.md` de la raíz.

## Dos fuentes de datos, con límites claros

| Contenido                                                                       | Fuente        | Cómo se accede                               |
| ------------------------------------------------------------------------------- | ------------- | -------------------------------------------- |
| **Editorial**: blog, páginas institucionales, header y footer, zonas, redirects | Payload       | Local API de Payload desde Server Components |
| **Negocio**: propiedades, emprendimientos, destacados, promociones, formularios | `@norde/core` | Casos de uso a través de `src/container.ts`  |

- PROHIBIDO modelar propiedades, clientes u oportunidades como colecciones de Payload.
- PROHIBIDO guardar datos personales en Payload. Los formularios (contacto, tasación, alertas) llaman casos de uso del core con `actor = system:web`.
- Payload es la **excepción** a la regla de capas: sus colecciones, hooks y Local API se usan directamente en esta app, **solo para contenido editorial**.

## Reglas

- **Server Components** por defecto. `"use client"` solo donde hay interacción (filtros, galería, modal, widget de chat).
- **Propiedades**:
  - Fichas con ISR y revalidación por tag (`property:<id>`), que dispara el sistema vía `POST /api/revalidate` (con secreto).
  - Listados con filtros en query params.
- **SEO obligatorio en toda página nueva**:
  - `generateMetadata` con title, description, canonical y OG.
  - JSON-LD que corresponda (`RealEstateListing`, `BreadcrumbList`, `BlogPosting`, `FAQPage`).
  - Entrada en el sitemap.
  - Un solo H1.
- **Datos del negocio** (nombre, teléfono, dirección, redes): solo desde `src/constants/business.ts`.
- **Paginación** con `<a href>` reales. Imágenes con `next/image` y `alt` descriptivo.
- **Payload**:
  - Estructura:
    - `src/payload.config.ts` es la configuración.
    - Las colecciones y los globals van en `src/payload/`, con un archivo por colección y named exports.
    - Las tablas van en el esquema de Postgres `payload`.
  - **Archivos generados, no se editan a mano**:
    - `src/app/(payload)/**`, que Payload reescribe al actualizarse.
    - `src/payload-types.ts`.
    - `src/app/(payload)/admin/importMap.js`.
    - Están excluidos de ESLint y Prettier.
  - Después de cambiar colecciones: `pnpm generate:types` y `pnpm migrate:create`.
  - Después de agregar componentes custom al admin: `pnpm generate:importmap`.
  - En deploy: `payload migrate < /dev/null`.
  - **Nunca** correr Payload en modo dev contra la base de producción.
- **Modal promocional**: se muestra una vez por sesión; en mobile, banner chico (sin interstitial intrusivo). Accesible (foco, Esc, `role="dialog"`).
- **Performance**: vigilar Core Web Vitals. Nada de scripts de terceros sin `next/script` y estrategia de carga.
- No replicar los problemas de DS-DESIGN-Landing listados en la sección 2 del documento del módulo.

## Tests

- Utilidades de SEO (metadata, JSON-LD, sitemaps): unit tests.
- E2E con Playwright: home, listado con filtros, ficha, formulario de contacto, post del blog.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
