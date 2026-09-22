# Norde Propiedades

Monorepo del sistema de Norde Propiedades: sitio web, panel de gestión interno y agente de IA.

Antes de contribuir, leé [CLAUDE.md](CLAUDE.md) (reglas obligatorias) y [docs/arquitectura.md](docs/arquitectura.md).

## Estructura

| Ruta              | Qué es                                                      | Puerto dev |
| ----------------- | ----------------------------------------------------------- | ---------- |
| `apps/web`        | Next.js + Payload: sitio público y blog (admin en `/admin`) | 3000       |
| `apps/gestion`    | Next.js: panel interno                                      | 3001       |
| `apps/agent`      | Fastify: agente IA (WhatsApp + web chat), webhooks, jobs    | 3100       |
| `packages/core`   | `@norde/core`: dominio y casos de uso                       | —          |
| `packages/infra`  | `@norde/infra`: Drizzle y adaptadores externos              | —          |
| `packages/ui`     | `@norde/ui`: Tailwind v4 + componentes shadcn compartidos   | —          |
| `packages/config` | `@norde/config`: tsconfig, ESLint (capas y módulos), Vitest | —          |

## Requisitos

- Node.js 24 (`.nvmrc`)
- pnpm 10 (`corepack enable`)
- PostgreSQL 17 o superior

## Primeros pasos

```bash
pnpm install

# Variables de entorno de cada app (completar DATABASE_URL y PAYLOAD_SECRET)
cp apps/web/.env.example apps/web/.env
cp apps/gestion/.env.example apps/gestion/.env
cp apps/agent/.env.example apps/agent/.env

# Crea la base si no existe y aplica las migraciones (core + Payload). Solo desarrollo.
pnpm db:setup

pnpm dev
```

`db:setup` necesita un usuario de Postgres con permiso para crear bases. Si preferís un rol dedicado al proyecto en lugar de `postgres`, creálo antes con `scripts/db/create-dev-database.sql`.

El primer usuario del admin de Payload se crea en <http://localhost:3000/admin>.

```bash
# Generar un PAYLOAD_SECRET
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## Comandos

```bash
pnpm dev                                  # todas las apps en modo desarrollo
pnpm --filter @norde/gestion dev          # una sola app
pnpm check                                # lint + typecheck + test + build + formato
pnpm format                               # formatear con Prettier
pnpm --filter @norde/infra db:generate    # migración del core desde el esquema Drizzle
pnpm db:setup                             # crear base local + aplicar todas las migraciones
pnpm --filter @norde/web migrate:create   # migración de Payload tras cambiar colecciones
pnpm --filter @norde/web generate:types   # regenerar payload-types.ts
```

## Flujo de trabajo

- Nunca commitear a `main`: ramas `feat/…`, `fix/…`, `chore/…` y PR.
- [Conventional Commits](https://www.conventionalcommits.org/) con el módulo o la app como scope: `feat(clients): …`.
- Los hooks de Husky corren lint-staged, typecheck y commitlint en cada commit, y lint + tests antes de cada push.
