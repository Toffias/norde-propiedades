# CLAUDE.md: @norde/infra

Implementaciones de los puertos definidos en `@norde/core`: base de datos, OpenAI, WhatsApp, mail, storage, geocoding, INDEC y portales.

Se aplica además del `CLAUDE.md` de la raíz.

## Reglas

- **Solo implementa puertos del core.** Si hace falta un puerto nuevo, se define primero en `core/<module>/application/ports` (o como repositorio en `domain/`) y después se implementa acá.
- **Sin lógica de negocio.**
  - Un repositorio mapea entre filas y aggregates (con `Aggregate.restore(...)`), y nada más.
  - Un adaptador traduce entre la API externa y el puerto, y nada más.
- **Nombres**: `Drizzle<Aggregate>Repository`, `Drizzle<Name>Query`, `Meta<Name>Gateway`, `OpenAi<Name>Gateway`, `Resend<Name>Mailer`, etc.

## Base de datos

- Esquema Drizzle en `src/db/schema/`, un archivo por módulo del core, **todo en el esquema de Postgres `core`**. Payload usa su propio esquema (`payload`) y pg-boss el suyo (`pgboss`).
- Migraciones:
  - **Solo** con `drizzle-kit generate` y revisadas a mano antes de commitear.
  - PROHIBIDO `drizzle-kit push` contra cualquier base que no sea local.
  - Las migraciones son **compatibles hacia atrás** (expand, después contract): los tres procesos comparten la base.
- Plata como `bigint` (centavos) + columna de moneda. Fechas como `timestamptz`. IDs `uuid` (v7, generados en la app).
- Índices para toda columna usada en filtros de listados, búsquedas del agente o reportes.
- Transacciones solo a través de `UnitOfWork`. Los repositorios reciben el `tx` y no abren transacciones propias.
- Sin foreign keys entre tablas de módulos distintos, salvo que un ADR lo permita.

## Adaptadores externos

- Todo input que viene de afuera (respuestas de APIs, webhooks) se valida con Zod antes de mapearlo.
- Timeouts explícitos en todo `fetch`.
- Reintentos solo en errores transitorios (5xx, 429, red). **Nunca** reintentar 4xx en envíos que se cobran (WhatsApp).
- Errores de la API externa se traducen al error del puerto. Nunca se filtra el tipo del SDK hacia el core.
- Secretos por constructor (vienen del `env.ts` de cada app), nunca leídos de `process.env` acá.
- Logs sin datos personales en claro.

## Tests

- Repositorios y queries: integración con Postgres real (Testcontainers), en `*.int.test.ts`.
- Adaptadores: respuestas grabadas (fixtures) y tests de parsing, firma y manejo de errores. Sin llamadas reales en CI.
