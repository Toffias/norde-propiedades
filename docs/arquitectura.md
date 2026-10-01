# Arquitectura y lineamientos técnicos

> Documento de referencia técnica del proyecto. Las reglas **obligatorias** están resumidas en los `CLAUDE.md` (raíz, cada app y cada paquete). Este documento explica el **por qué**.
> Relacionados: [diagrama-general.md](diagrama-general.md) · [módulos](modulos/)

---

## 1. Principios

1. **Clean Architecture**: el negocio (dominio y casos de uso) no depende de frameworks, base de datos, UI ni proveedores externos. Next.js, Fastify, Drizzle, OpenAI, WhatsApp y los portales son **detalles** que se enchufan desde afuera.
2. **Monolito modular**: un solo núcleo de negocio (`@norde/core`) dividido en **módulos** con límites claros, desplegado en **tres procesos**. Si algún día un módulo necesita ser un servicio aparte, los límites ya están.
3. **Una sola fuente de verdad**: propiedades, clientes y oportunidades viven en el core y en una sola base. Nada se duplica entre la web, el panel y el agente.
4. **Explícito antes que mágico**: inyección de dependencias manual, errores tipados y sin decoradores ni contenedores de DI.
5. **Reglas verificadas por herramientas**: los límites entre capas y módulos los controla el linter y el CI, no solo la buena voluntad.
6. **Se crece de a poco**: se empieza simple (un paquete core con carpetas por módulo) y se divide cuando duela, no antes.

---

## 2. Vista general

```
                                   Internet
          ┌──────────────────────────┼──────────────────────────────┐
          │                          │                              │
     norde.com.ar            gestion.norde.com.ar           agent.norde.com.ar
   (sitio público)           (panel interno)          (webhooks + API del web chat)
          │                          │                              │
 ┌────────▼─────────┐     ┌──────────▼─────────┐      ┌─────────────▼─────────────┐
 │ apps/web         │     │ apps/gestion       │      │ apps/agent                │
 │ Next.js + Payload│     │ Next.js            │      │ Fastify                   │
 │ sitio + blog     │     │ panel + auth       │      │ agente IA (WA + web chat) │
 │                  │     │ + agente soporte   │      │ webhooks de portales      │
 │                  │     │                    │      │ jobs en segundo plano     │
 └────────┬─────────┘     └──────────┬─────────┘      └─────────────┬─────────────┘
          │  Presentación: cada app es un "composition root" que arma los  │
          │  casos de uso con sus adaptadores y los expone a su manera     │
          └──────────────────────────┬─────────────────────────────────────┘
                                     │
               ┌─────────────────────▼──────────────────────┐
               │ @norde/core   dominio + casos de uso       │  ← no conoce a nadie
               ├────────────────────────────────────────────┤
               │ @norde/infra  Drizzle, OpenAI, WhatsApp,   │  ← implementa los
               │               mail, storage, portales, IPC │    puertos del core
               └─────────────────────┬──────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │     PostgreSQL      │  esquemas: core · payload · pgboss
                          └─────────────────────┘
```

**Tres procesos independientes:**

| Proceso        | Responsabilidad                                                                                                                                                                       | Por qué separado                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web`     | Sitio público, blog (Payload), formularios, SEO                                                                                                                                       | Público y cacheado; su deploy no afecta al negocio interno                                        |
| `apps/gestion` | Panel interno del equipo, login, roles, bandeja de conversaciones, agente de soporte interno                                                                                          | Se despliega seguido (UI); si falla, no corta la atención al cliente                              |
| `apps/agent`   | Agente de IA de WhatsApp y web chat, webhooks entrantes (Meta, MercadoLibre, portales), **jobs en segundo plano** (IPC, alertas, sincronización con portales, revalidación de la web) | Es el proceso de larga duración: tiene que estar siempre arriba y responder rápido a los webhooks |

Los tres importan el **mismo core**. No hay API HTTP interna entre ellos: cada proceso llama a los casos de uso directamente, contra la misma base. La comunicación asíncrona entre procesos se hace con **eventos de dominio** guardados en la base (outbox + pg-boss).

---

## 3. Estructura del monorepo

```
norde-propiedades/
├── apps/
│   ├── web/                    # Next.js + Payload (módulo 2)
│   ├── gestion/                # Next.js, panel interno (módulo 3)
│   └── agent/                  # Fastify: agente IA + webhooks + jobs (módulo 1)
├── packages/
│   ├── core/                   # @norde/core: dominio + aplicación (sin frameworks)
│   ├── infra/                  # @norde/infra: implementaciones de los puertos
│   ├── agent-kit/              # @norde/agent-kit: runner de agentes IA reutilizable
│   ├── ui/                     # @norde/ui: componentes shadcn compartidos y un tema por app
│   └── config/                 # @norde/config: tsconfig, eslint, prettier, vitest base
├── docs/
│   ├── arquitectura.md         # este documento
│   ├── adr/                    # decisiones de arquitectura (una por archivo)
│   └── modulos/
├── CLAUDE.md
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 3.1 `@norde/core`: organizado por módulo y, dentro, por capa

```
packages/core/src/
├── shared/                          # "shared kernel": solo lo realmente transversal
│   ├── domain/                      # Result, DomainError, DomainEvent, Entity, AggregateRoot
│   │   └── value-objects/           # Money, Phone (E.164), Email, Address, GeoPoint, Id
│   └── application/                 # Actor (quién ejecuta), UnitOfWork, Clock, IdGenerator,
│                                    # EventPublisher, Pagination, AuditLog (puertos)
├── properties/                      # Propiedades, emprendimientos y unidades
│   ├── domain/
│   │   ├── property.ts              # Aggregate root
│   │   ├── property-status.ts       # Value object / máquina de estados
│   │   ├── property.events.ts       # PropertyPublished, PropertyPriceChanged…
│   │   ├── property.errors.ts
│   │   └── property.repository.ts   # Puerto (interface)
│   ├── application/
│   │   ├── commands/                # Casos de uso que modifican estado
│   │   │   ├── create-property.ts
│   │   │   └── publish-property.ts
│   │   ├── queries/                 # Casos de uso de lectura (listados, mapa, búsqueda)
│   │   │   └── search-properties.ts
│   │   └── ports/                   # Puertos específicos (ej. Geocoder)
│   ├── contracts/                   # Schemas Zod + tipos de entrada y salida (seguros para el cliente)
│   └── index.ts                     # API pública del módulo (lo único importable desde afuera)
├── clients/                         # Clientes, canales de contacto, oportunidades
├── rentals/                         # Contratos de alquiler, actualizaciones por IPC
├── appraisals/                      # Tasaciones
├── promotions/                      # Modal promocional de la web
├── conversations/                   # Conversaciones del agente, handoff
├── portals/                         # Publicación en portales, contactos entrantes
├── identity/                        # Usuarios, roles, permisos, sucursales, equipos
├── settings/                        # Configuración general de la empresa, numeración, archivos
├── notifications/                   # Notificaciones a usuarios y sus preferencias
├── audit/                           # Trazabilidad de cambios
└── reporting/                       # Consultas de reportes (solo lectura)
```

### 3.2 `@norde/infra`: implementaciones

```
packages/infra/src/
├── db/
│   ├── client.ts                    # Pool pg + Drizzle
│   ├── schema/                      # Tablas Drizzle, un archivo por módulo
│   ├── migrations/                  # Generadas por drizzle-kit
│   └── unit-of-work.ts              # Transacciones
├── properties/drizzle-property.repository.ts
├── clients/…
├── jobs/                            # Relay del outbox y colas de eventos (pg-boss)
├── adapters/
│   ├── whatsapp/                    # Meta Cloud API (del MVP APZ-WP-BOT)
│   ├── openai/
│   ├── mail/                        # Resend, Postmark o Brevo
│   ├── storage/                     # S3 / R2
│   ├── geocoding/
│   ├── indec/                       # Serie IPC (datos.gob.ar)
│   └── portals/                     # mercadolibre/, zonaprop/, argenprop/
└── index.ts
```

---

## 4. Capas y regla de dependencias

```
   ┌───────────────────────────────────────────────────────────┐
   │  Presentación / Frameworks (apps/*)                       │
   │  Next.js pages, Server Actions, route handlers,           │
   │  rutas Fastify, tools del agente IA, workers de jobs      │
   │   ┌───────────────────────────────────────────────────┐   │
   │   │  Infraestructura (@norde/infra)                   │   │
   │   │  repos Drizzle, WhatsApp, OpenAI, mail, portales  │   │
   │   │   ┌───────────────────────────────────────────┐   │   │
   │   │   │  Aplicación (core/*/application)          │   │   │
   │   │   │  casos de uso, puertos, DTOs              │   │   │
   │   │   │   ┌───────────────────────────────────┐   │   │   │
   │   │   │   │  Dominio (core/*/domain)          │   │   │   │
   │   │   │   │  entidades, value objects,        │   │   │   │
   │   │   │   │  eventos, reglas de negocio       │   │   │   │
   │   │   │   └───────────────────────────────────┘   │   │   │
   │   │   └───────────────────────────────────────────┘   │   │
   │   └───────────────────────────────────────────────────┘   │
   └───────────────────────────────────────────────────────────┘
            Las dependencias apuntan SIEMPRE hacia adentro
```

| Capa                | Contiene                                                                                     | Puede importar                                                                          | NO puede importar                                                 |
| ------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Dominio**         | Entidades, aggregates, value objects, eventos, errores de dominio, interfaces de repositorio | Solo `shared/domain` y otros archivos de su propio dominio                              | Nada de infra, frameworks, Zod, Drizzle, `fetch` ni `process.env` |
| **Aplicación**      | Casos de uso (commands y queries), puertos de servicios externos, DTOs, contracts (Zod)      | Dominio (el suyo y `shared`), la API pública (`index.ts`) de otros módulos, Zod         | Infra, frameworks, SDKs                                           |
| **Infraestructura** | Implementaciones de puertos: repos Drizzle, clientes HTTP, SDKs                              | Core (puertos y tipos), librerías externas                                              | Apps, presentación                                                |
| **Presentación**    | UI, rutas HTTP, Server Actions, tools del agente, workers de jobs, composition root          | Core (casos de uso y contracts), infra (**solo** en el composition root), agent-kit, ui | Drizzle directo, repos directos, lógica de negocio                |

### Qué va en cada lugar (guía rápida)

- **Una regla de negocio** ("una propiedad reservada no se puede publicar en portales", "el monto por IPC se redondea a…"): **dominio**.
- **Una orquestación** ("crear la oportunidad, asignar agente, emitir evento, auditar"): **caso de uso**.
- **Hablar con algo externo** (base, API, mail): **puerto** en el core e **implementación** en infra.
- **Validar la forma de un input** (tipos, requeridos, formatos): **contract Zod**, que usan la UI y el caso de uso.
- **Mostrar, mapear errores a mensajes, leer cookies o headers**: **presentación**.

---

## 5. Módulos (bounded contexts)

| Módulo          | Responsabilidad                                                                              | Eventos que emite (ejemplos)                                         |
| --------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `properties`    | Propiedades, emprendimientos, unidades, estados, fotos, destacados, mapa                     | `PropertyPublished`, `PropertyPriceChanged`, `PropertyStatusChanged` |
| `clients`       | Clientes, canales de contacto, deduplicación, oportunidades, asignación, búsquedas guardadas | `ClientRegistered`, `OpportunityCreated`, `OpportunityStatusChanged` |
| `rentals`       | Contratos, partes, garantes, actualizaciones por IPC, vencimientos                           | `RentUpdateCalculated`, `ContractExpiring`                           |
| `appraisals`    | Tasaciones, conversión a propiedad                                                           | `AppraisalCompleted`, `AppraisalConverted`                           |
| `promotions`    | Promociones del modal de la web                                                              | `PromotionActivated`                                                 |
| `conversations` | Conversaciones del agente, historial, handoff humano                                         | `ConversationHandedOff`, `ConversationReturnedToBot`                 |
| `portals`       | Publicación en portales, estado de sincronización, contactos entrantes                       | `ListingSyncFailed`, `PortalContactReceived`                         |
| `identity`      | Usuarios, roles, permisos, sucursales, equipos, favoritos                                    | `UserCreated`, `RoleChanged`                                         |
| `settings`      | Configuración general de la empresa, numeración de códigos, archivos de la empresa           | `CompanySettingsChanged`                                             |
| `notifications` | Notificaciones a usuarios (en el panel y por mail) y sus preferencias                        | —                                                                    |
| `audit`         | Registro de cambios (quién, qué, cuándo, antes y después)                                    | —                                                                    |
| `reporting`     | Consultas de solo lectura para reportes (ventas, orígenes, embudo, costos)                   | —                                                                    |

La configuración propia de un módulo (oportunidades, consultas, reservas, propiedades) vive en una tabla de fila única **de ese módulo**, no en `settings`. Las tablas de cada módulo están en `docs/modelo-de-datos.md`.

**Reglas entre módulos:**

1. Un módulo **solo** importa de otro a través de su `index.ts` (API pública). Nunca `clients/domain/...` desde `properties`.
2. **Llamada directa** (caso de uso → API pública de otro módulo): solo si se necesita una respuesta en el momento. Ejemplo: `RegisterContact` necesita saber si la propiedad existe.
3. **Evento de dominio**: cuando es una reacción. Ejemplo: `PropertyPriceChanged` → `clients` busca búsquedas guardadas que coincidan → alertas.
4. Un aggregate **nunca** referencia objetos de otro módulo: solo su **ID** (por ejemplo, `opportunity.propertyId`).
5. **No** hay foreign keys de Drizzle entre esquemas de módulos distintos, salvo que se decida explícitamente en un ADR.

---

## 6. Patrones y convenciones

### 6.1 Casos de uso

Un caso de uso es una clase con **un** método público `execute`. Recibe sus dependencias (puertos) por constructor, el input ya tipado y el `Actor` que lo ejecuta. Devuelve un `Result`.

```ts
// packages/core/src/clients/application/commands/register-contact.ts
export class RegisterContact {
  constructor(
    private readonly deps: {
      clients: ClientRepository;
      opportunities: OpportunityRepository;
      properties: PropertiesQueryApi; // API pública de otro módulo
      uow: UnitOfWork;
      events: EventPublisher;
      audit: AuditLog;
      ids: IdGenerator;
      clock: Clock;
    },
  ) {}

  async execute(
    input: RegisterContactInput, // tipo inferido del contract Zod
    actor: Actor, // usuario, o 'system:agent-ia', 'system:portal-sync'
  ): Promise<Result<RegisterContactOutput, RegisterContactError>> {
    if (!actor.can('clients:create')) return err({ type: 'Forbidden' });

    return this.deps.uow.run(async (tx) => {
      const phone = Phone.create(input.phone);
      if (phone.isErr()) return err({ type: 'InvalidPhone' });

      const client =
        (await tx.clients.findByPhoneOrEmail(phone.value, input.email)) ??
        Client.create({ id: this.deps.ids.next(), name: input.name, phone: phone.value });

      client.addChannel(input.channel, input.channelExternalId, this.deps.clock.now());
      const opportunity = client.openOpportunity({/* ... */});

      await tx.clients.save(client);
      await tx.opportunities.save(opportunity);
      await tx.events.publish(client.pullEvents(), opportunity.pullEvents()); // outbox, misma transacción
      await tx.audit.record(actor, 'client.contact_registered', { clientId: client.id });

      return ok({ clientId: client.id, opportunityId: opportunity.id });
    });
  }
}
```

**Nombres:**

- Commands: verbo + sustantivo en inglés (`PublishProperty`, `ConvertAppraisalToListing`).
- Queries: `Get…` o `Search…` (`SearchProperties`, `GetClientTimeline`).

### 6.2 Errores

- **Errores esperados** (negocio y validación): `Result<T, E>`, donde `E` es una **unión discriminada** (`{ type: 'PropertyNotFound' } | { type: 'InvalidTransition', from, to }`). La presentación los traduce a mensajes o a códigos HTTP.
- **Errores inesperados** (se cayó la base, un bug): se lanzan como excepción, se capturan en el borde (route handler, Server Action, worker), se loguean y se reportan.
- **Prohibido**: `catch` vacíos, `throw` de strings, y devolver `null` para indicar un error.

### 6.3 Value objects

- `Money`: monto como entero en centavos (`bigint`) más la moneda (`ARS` | `USD`). **Nunca** `number` con decimales para plata. Los cálculos de IPC usan una librería decimal y se redondean con una regla explícita del dominio.
- `Phone`: normalizado a **E.164** con `libphonenumber-js`. Es la base de la deduplicación de clientes.
- Otros: `Email`, `Address`, `GeoPoint`, `PropertyStatus` (con transiciones válidas).
- Se crean con `X.create(raw): Result<X, E>`. Si un VO existe, es válido.

### 6.4 Commands y queries (CQRS liviano)

- **Commands**: cargan el aggregate con su repositorio, aplican la regla en el dominio y guardan. Pasan por dominio siempre.
- **Queries** (listados, mapa, reportes, búsqueda del agente): pueden usar un **puerto de consulta** que infra implementa con SQL optimizado, y devuelven DTOs planos. **No** hace falta armar aggregates para mostrar una tabla.
- Así se evita que la necesidad de listados rápidos contamine el modelo de dominio.

### 6.5 Transacciones, eventos y jobs

- `UnitOfWork.run(fn)` abre una transacción. Los repositorios que recibe `fn` operan dentro de ella.
- Los **eventos de dominio** se guardan en la tabla `outbox` **en la misma transacción**. Un relay en `apps/agent` los publica en **pg-boss**, y los handlers (casos de uso) reaccionan. Así no se pierde un evento si el proceso se cae.
- Los **jobs programados** (IPC diario, alertas, sincronización con portales) son casos de uso disparados por pg-boss en `apps/agent`.
- Los handlers son **idempotentes**: un evento puede procesarse dos veces sin romper nada.

### 6.6 Autorización y auditoría

- La autorización se decide **en el caso de uso** con el `Actor`, no solo ocultando botones en la UI.
  - Permisos: `recurso:acción` (`properties:update`, `clients:export`).
  - Reglas de pertenencia: un agente edita solo sus clientes.
- **Actores de sistema** con permisos acotados: `system:agent-ia`, `system:portal-sync`, `system:scheduler`, `system:web` (formularios públicos), `system:import` (importación de Tokko y backfills).
- Todo command que modifica datos registra una entrada de **auditoría** en la misma transacción (actor, acción, entidad, cambios).

### 6.7 Inyección de dependencias

- **Manual**, en un `composition root` por app (`apps/*/src/container.ts`), que instancia infra y arma los casos de uso. Sin librerías de DI ni decoradores.
- Los tests arman los casos de uso con **fakes en memoria** de los puertos.

### 6.8 Convenciones de código

| Tema     | Regla                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idioma   | Código, identificadores, commits y nombres de archivo en **inglés**. Textos de UI, prompts del agente y documentación en **español**                                                   |
| Archivos | `kebab-case.ts`; un caso de uso por archivo; tests al lado (`*.test.ts`), integración `*.int.test.ts`                                                                                  |
| Tipos    | TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Sin `any` (usar `unknown` y validar), sin `as` salvo en adaptadores con un comentario que lo justifique |
| Exports  | Named exports. Barrel (`index.ts`) **solo** como API pública de un módulo o paquete                                                                                                    |
| IDs      | UUID v7, generados por el `IdGenerator` (no por la base)                                                                                                                               |
| Fechas   | Se guardan en UTC (`timestamptz`). Se muestran en `America/Argentina/Buenos_Aires`. El tiempo se obtiene de `Clock`, nunca `new Date()` en el core                                     |
| Config   | Cada app valida su entorno con Zod al arrancar. Se lee `process.env` solo en ese archivo                                                                                               |
| Logs     | pino estructurado, con `requestId` o `jobId`. **Sin datos personales en claro** (teléfonos y emails enmascarados)                                                                      |

---

## 7. Stack recomendado

| Pieza                   | Elección                                                                                                               | Motivo                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Lenguaje                | **TypeScript 6.0** estricto                                                                                            | TS 7 (compilador nativo) ya salió, pero typescript-eslint todavía no lo soporta; migrar cuando lo haga             |
| Runtime                 | **Node.js 24 LTS**                                                                                                     | LTS vigente; soportado por Next 16 y Payload 3                                                                     |
| Monorepo                | **pnpm workspaces + Turborepo**                                                                                        | pnpm impide importar dependencias no declaradas; Turbo cachea lint, test y build y respeta el orden entre paquetes |
| Web pública             | **Next.js 16 + Payload 3**                                                                                             | Reutiliza DS-DESIGN-Landing                                                                                        |
| Panel                   | **Next.js 16** (App Router, Server Actions)                                                                            | Mismo framework que la web, un solo stack de frontend                                                              |
| Agente, webhooks y jobs | **Fastify 5**, ejecutado con **tsx** desde el código fuente (sin bundle)                                               | Reutiliza el MVP APZ-WP-BOT. Sin bundle, cada paquete del workspace resuelve sus dependencias (pnpm estricto)      |
| Paquetes internos       | Se consumen como **TypeScript fuente** (sin build propio); Next.js los transpila con `transpilePackages`               | Cero pasos de build intermedios; los cambios en el core se ven al instante en las apps                             |
| IA                      | **OpenAI Agents SDK** (`@openai/agents`), solo dentro de `@norde/agent-kit` (ADR 0009)                                 | Reutiliza el MVP; cambiar de proveedor es reescribir `agent-kit`, sin tocar el core ni las tools                   |
| Base de datos           | **PostgreSQL 17+** (en desarrollo local, 18)                                                                           | Única base: esquemas `core`, `payload`, `pgboss`. En producción usar la misma versión mayor que en desarrollo      |
| ORM                     | **Drizzle** (solo en `@norde/infra`)                                                                                   | Usado en el MVP y por Payload; SQL explícito y tipado                                                              |
| Colas y jobs            | **pg-boss**                                                                                                            | Colas, reintentos y cron sobre la misma base; sin Redis por ahora                                                  |
| Validación              | **Zod 4**                                                                                                              | Contracts compartidos entre UI y casos de uso; validación del entorno                                              |
| Autenticación           | **Better Auth** (adapter de Drizzle)                                                                                   | Sesiones en base, extensible a 2FA; roles y permisos propios en `identity`                                         |
| UI                      | **Tailwind v4 + shadcn/ui** en `@norde/ui`                                                                             | Mismos componentes en la web y el panel; un tema por app (ADR 0012, `docs/diseno-gestion.md`)                      |
| Tablas y formularios    | TanStack Table, react-hook-form + Zod                                                                                  | Estándar para ABMs                                                                                                 |
| Teléfonos               | `libphonenumber-js`                                                                                                    | Normalización E.164 para deduplicar                                                                                |
| Plata e IPC             | Montos en centavos (`bigint`) más `decimal.js` para índices                                                            | Sin errores de coma flotante                                                                                       |
| Excel                   | `exceljs`                                                                                                              | Exportaciones                                                                                                      |
| Archivos                | S3 o Cloudflare R2 (`@payloadcms/storage-s3` en la web)                                                                | Servicio en la nube para imágenes                                                                                  |
| Tests                   | **Vitest** (unit e integración contra Postgres real, ADR 0010), **Playwright** (E2E)                                   |                                                                                                                    |
| Calidad                 | ESLint (flat config) + `typescript-eslint` + **`eslint-plugin-boundaries`**, Prettier, Husky + lint-staged, commitlint | Los límites de capas y módulos se verifican automáticamente                                                        |
| Errores en producción   | Sentry (opcional desde el inicio)                                                                                      |                                                                                                                    |
| Deploy                  | VPS Hostinger, **PM2** (los tres procesos en un `ecosystem.config.cjs`), Nginx, Certbot, GitHub Actions                | Reutiliza el pipeline de DS-DESIGN-Landing                                                                         |

---

## 8. Estrategia de tests

| Nivel                    | Qué se prueba                                                                    | Cómo                                             | Obligatorio                        |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------- |
| **Dominio**              | Entidades, value objects, transiciones de estado, cálculo de IPC                 | Unit tests puros, sin mocks                      | **Siempre**, para toda regla nueva |
| **Aplicación**           | Casos de uso: camino feliz, errores esperados, permisos                          | Fakes en memoria de los puertos                  | **Siempre**, para todo caso de uso |
| **Infraestructura**      | Repos Drizzle, mapeos, queries                                                   | Postgres real (base `_test`, ADR 0010)           | Para repos y queries no triviales  |
| **Adaptadores externos** | WhatsApp, portales, mail                                                         | Tests con respuestas grabadas; firma de webhooks | Parsing y firma, siempre           |
| **Presentación**         | Rutas Fastify (`inject`), Server Actions críticas                                | Integración                                      | Webhooks y endpoints públicos      |
| **E2E**                  | Flujos clave: login, cargar propiedad, verla en la web, lead del bot en el panel | Playwright                                       | Flujos críticos                    |

Cobertura mínima orientativa: **90% en `core/*/domain`**, **80% en `core/*/application`**. En el resto no se persigue un número.

---

## 9. Calidad automatizada

- **`eslint-plugin-boundaries`** hace cumplir la sección 4 (capas) y la 5 (módulos). Una violación **rompe el CI**.
- `no-restricted-imports`: prohíbe `drizzle-orm`, `pg` y `@norde/infra/*/repositories` en apps, salvo en `container.ts`.
- **CI (GitHub Actions)**: `pnpm turbo lint typecheck test build` en cada PR; integración con Postgres de servicio.
- **Hooks**: pre-commit (lint-staged + typecheck de lo afectado + gitleaks), commit-msg (commitlint). Tienen que **funcionar** desde el día 1.
- **Conventional Commits** (`feat(clients): …`, `fix(agent): …`), con el scope por módulo o app.
- **Ramas**: nunca commitear a `main`. Ramas `feat/…` y `fix/…`, y PR con review.
- **ADRs** en `docs/adr/NNNN-titulo.md` para toda decisión que cambie esta arquitectura.

---

## 10. Deploy

- Un VPS con los tres procesos bajo **PM2**, Nginx como proxy reverso por subdominio y SSL con Certbot.
- **Orden del deploy**:
  1. `pnpm install --frozen-lockfile`
  2. Migraciones de core (`drizzle-kit migrate`)
  3. Migraciones de Payload (`payload migrate < /dev/null`)
  4. `turbo build`
  5. `pm2 reload` app por app
- **Migraciones compatibles hacia atrás** (expand, después contract): primero se agrega, después se deja de usar y recién después se borra. Los tres procesos comparten la base y no se recargan en el mismo instante.
- **Un solo usuario de base** con permisos totales, compartido por la web (y Payload), el agente y el panel (ADR 0015). Lo que cada persona puede hacer lo deciden los **roles y permisos del sistema** (módulo `identity`), en los casos de uso.
- **Extensiones** de PostgreSQL: `pg_trgm` y `unaccent` (búsqueda de texto). Las crea la migración `0001`; el dueño de la base tiene que poder crearlas (son _trusted_ desde PostgreSQL 13).
- Backups diarios de PostgreSQL con retención.

---

## 11. Decisiones tomadas (ADRs a registrar)

| #    | Decisión                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | Monorepo con pnpm workspaces + Turborepo                                                                                                             |
| 0002 | Clean Architecture sobre un monolito modular (`@norde/core` + `@norde/infra`)                                                                        |
| 0003 | Gestión y agente en **procesos separados** que comparten core y base, sin API HTTP interna                                                           |
| 0004 | Payload solo para contenido editorial (blog, páginas). El negocio vive en el core                                                                    |
| 0005 | Una sola base PostgreSQL con esquemas separados                                                                                                      |
| 0006 | Eventos de dominio con outbox + pg-boss; jobs y relay corren en `apps/agent`                                                                         |
| 0007 | Inyección de dependencias manual por composition root                                                                                                |
| 0008 | `Result` para errores esperados y excepciones para los inesperados                                                                                   |
| 0009 | [`@norde/agent-kit` envuelve el OpenAI Agents SDK](adr/0009-agent-kit-sobre-openai-agents-sdk.md), sin puerto `LlmGateway` en el core                |
| 0010 | [Tests de integración contra un Postgres real](adr/0010-tests-de-integracion-con-postgres-local.md), sin Testcontainers por ahora                    |
| 0011 | [La web no lee la base en el build](adr/0011-web-render-on-demand-sin-base-en-el-build.md): ISR on-demand y caché de datos por tag                   |
| 0012 | [El panel adopta el sistema visual de Alquilo](adr/0012-identidad-visual-del-panel-y-temas-por-app.md), con un tema por app en `@norde/ui`           |
| 0013 | [Estados de oportunidad editables](adr/0013-estados-de-oportunidad-editables-con-categoria-fija.md), cada uno con una categoría fija del dominio     |
| 0014 | [Atributos de propiedad en columnas tipadas](adr/0014-atributos-de-propiedad-tipados-y-eav-solo-personalizados.md); EAV solo para los personalizados |
| 0015 | [Un solo usuario de base compartido](adr/0015-un-usuario-de-base-y-permisos-en-el-sistema.md); los permisos se deciden en el sistema                 |

---

## 12. Ejemplo de punta a punta

"Una persona escribe por WhatsApp preguntando por un 2 ambientes en Palermo y pide visitar uno":

1. **`apps/agent`, presentación**: la ruta `POST /webhook` verifica la firma, agrupa los mensajes y encola el turno.
2. **`@norde/agent-kit`**: el runner arma el prompt y corre el turno con el OpenAI Agents SDK, que llama a las tools (ADR 0009).
3. **Tool `search_properties`** (presentación, en `apps/agent`): valida los argumentos y llama al caso de uso `SearchProperties` del módulo `properties` con `actor = system:agent-ia`.
4. **`SearchProperties`** (aplicación): usa el puerto `PropertySearchQuery`, que infra implementa con SQL. Devuelve DTOs.
5. **Tool `register_client`**: llama a `RegisterContact` del módulo `clients`, que deduplica por teléfono, agrega el canal WhatsApp, abre la oportunidad (tipo alquiler, estado nuevo), guarda el evento `OpportunityCreated` en el outbox y audita.
6. **Relay del outbox**: publica el evento en pg-boss. El handler `AssignOpportunity` asigna un agente y dispara la notificación.
7. **`apps/gestion`**: el asesor ve la oportunidad y la conversación en la bandeja. Al tomar el control, `HandOffConversation` pausa el bot.

Ninguna capa se saltea: el agente de IA no sabe que existe Drizzle, y el caso de uso no sabe que el pedido vino de WhatsApp.
