# Modelo de datos

Tablas del esquema `core` de PostgreSQL, por módulo. El código está en `packages/infra/src/db/schema/` (un archivo por módulo) y las migraciones en `packages/infra/src/db/migrations/`. La `0000_agent_foundation` creó la base del agente; la `0001_management_data_model` suma todo el sistema de gestión (#19).

## Convenciones

- **Mono-tenant**: sin `tenant_id`. La configuración es una tabla de **fila única** por módulo (PK `id boolean default true` + `check (id)`); la migración inserta la fila con sus valores por defecto.
- PK `uuid` v7 generado por la app. `created_at` / `updated_at` los setea la app con `Clock`.
- **Autoría** (`created_by`, `updated_by`): ID del usuario o actor de sistema (`system:agent-ia`). Las tablas de vínculo, que nunca se editan, solo tienen `created_at` y `created_by`. En las tablas de la `0000` son nullable hasta el backfill.
- **Papelera** (`deleted_at`, `deleted_by`) en `clients`, `properties`, `developments`, `saved_searches`, `inquiries`, `appraisals`, `branches` y `company_files`. Los índices de listados son parciales `where deleted_at is null`. `attachments` solo tiene `deleted_at`.
- Plata: `*_cents bigint` + `*_currency text`. Porcentajes `numeric(5,2)`, superficies `numeric(10,2)`, coordenadas `numeric(9,6)`.
- Enums como `text`, validados con Zod al mapear en infra.
- `jsonb` solo para configuración y criterios que no se filtran por SQL.
- **Foreign keys solo dentro de un módulo**. Entre módulos se guarda el ID sin FK, con el comentario `/** <Entidad> del módulo <x>: solo el ID, sin foreign key entre módulos. */`.
- Helpers de columnas comunes: `packages/infra/src/db/schema/columns.ts`.

## Búsqueda de texto

- Extensiones `pg_trgm` y `unaccent` (en `public`), creadas por la `0001`.
- `core.search_normalize(text)`: minúsculas y sin acentos. Es `IMMUTABLE` (usa el diccionario `public.unaccent` explícito), así que se puede usar en columnas generadas.
- `search_text` es una columna generada con índice GIN trigram en `clients` (nombre, email, teléfono, empresa, documento), `properties` (código, título, dirección, calle, barrio, ciudad) y `developments` (código, nombre, dirección publicada, desarrolladora). `locations.normalized_name` también tiene índice trigram.
- Para buscar: `search_text like '%' || core.search_normalize($1) || '%'`.

## Tablas por módulo

Entre paréntesis, los IDs de **otros módulos** que guarda cada tabla (sin FK).

### `identity` (`identity.ts`)

| Tabla                                                            | Qué es                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `users`                                                          | Usuarios del panel. Modelo de usuario de Better Auth (D5) con los campos propios de Norde |
| `sessions` · `accounts` · `verifications`                        | Tablas de Better Auth, con FK a `users` en cascada                                        |
| `roles` · `role_permissions` · `user_roles` · `user_permissions` | Roles y permisos del sistema (ver "Roles y permisos del sistema")                         |
| `branches`                                                       | Sucursales (D8: se modelan aunque haya una sola)                                          |
| `teams` · `team_members`                                         | Equipos                                                                                   |
| `user_favorites`                                                 | Favoritos por usuario (`entity_id` de clientes, propiedades, emprendimientos o búsquedas) |

### `settings` (`settings.ts`)

| Tabla                      | Qué es                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| `company_settings`         | Configuración general (fila única)                                  |
| `reference_code_sequences` | Numeración de códigos (`P-001`), tomada con `update … returning`    |
| `file_folders`             | Carpetas de archivos de la empresa (árbol con `path` materializado) |
| `company_files`            | Archivos de la empresa (`uploaded_by`)                              |

### `clients` (`clients.ts`)

| Tabla                                                          | Qué es (IDs de otros módulos)                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients`                                                      | Clientes. `phone_e164` y `email` son los principales y la base de la deduplicación (`agent_id`, `branch_id`)                                  |
| `client_channels`                                              | Canales por los que llegó (WhatsApp, portales)                                                                                                |
| `client_phones` · `client_emails`                              | Teléfonos y emails adicionales. `client_phones.phone_match_key` deduplica contra todos                                                        |
| `client_relations`                                             | Relaciones entre clientes (trabaja en, miembro de)                                                                                            |
| `client_tag_groups` · `client_tags` · `client_tag_assignments` | Etiquetas                                                                                                                                     |
| `client_activities`                                            | Actividad de la ficha (notas, envíos, reacciones). Reemplaza a `opportunities.notes`                                                          |
| `opportunities`                                                | Oportunidades. `status` es la categoría y `stage_id` el estado editable (ADR 0013) (`property_id`, `development_id`, `agent_id`, `branch_id`) |
| `opportunity_stages` · `opportunity_close_reasons`             | Estados editables y motivos de cierre                                                                                                         |
| `opportunity_status_changes`                                   | Historial de estados, para vigencia y conversión                                                                                              |
| `opportunity_settings`                                         | Estado de cada regla automática (fila única)                                                                                                  |
| `inquiries`                                                    | Consultas entrantes, idempotentes por (`channel`, `external_id`) (`property_id`, `development_id`, `assigned_agent_id`)                       |
| `inquiry_assignment_rules` · `inquiry_assignment_rule_agents`  | Reparto de consultas con pesos (`user_id`)                                                                                                    |
| `inquiry_settings`                                             | Horario de atención y guardia (fila única) (`on_call_user_id`)                                                                                |
| `saved_searches`                                               | Búsquedas guardadas (`location_ids`)                                                                                                          |
| `featured_listings`                                            | Propiedades destacadas para un cliente (`property_id`)                                                                                        |
| `shared_listings` · `shared_listing_items`                     | Envíos de propiedades por link, con aperturas y reacciones (`property_id`)                                                                    |
| `quick_replies`                                                | Respuestas rápidas                                                                                                                            |
| `follow_up_settings`                                           | Seguimiento automático (fila única)                                                                                                           |

### `properties` (`properties.ts`)

| Tabla                                                                                                | Qué es (IDs de otros módulos)                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `properties`                                                                                         | Propiedades, con los atributos estándar como columnas (ADR 0014) (`producer_user_id`, `branch_id`, `maintenance_user_id`)         |
| `property_operations` · `property_price_changes`                                                     | Operaciones con su precio, y el historial de precios                                                                              |
| `locations`                                                                                          | Ubicaciones jerárquicas con `path` materializado                                                                                  |
| `property_type_settings` · `property_settings`                                                       | Tipos habilitados y columnas de la grilla (fila única)                                                                            |
| `features` · `property_features` · `development_features`                                            | Catálogo de servicios, ambientes y amenities                                                                                      |
| `property_owners` · `property_appraisers`                                                            | Propietarios y tasadores (`client_id`, `user_id`)                                                                                 |
| `property_tag_groups` · `property_tags` · `property_tag_assignments` · `development_tag_assignments` | Etiquetas de propiedades y emprendimientos                                                                                        |
| `property_custom_attributes` · `property_custom_attribute_values`                                    | Atributos personalizados (EAV, ADR 0014)                                                                                          |
| `media_items` · `attachments`                                                                        | Fotos, planos, videos y documentos de una propiedad **o** un emprendimiento (`check`)                                             |
| `developments`                                                                                       | Emprendimientos (`commercial_contact_client_id`, `producer_user_id`, `branch_id`)                                                 |
| `reservations`                                                                                       | Reservas (D3), con una sola activa por propiedad (`client_id`, `opportunity_id`, `agent_user_id`, `manager_user_id`, `branch_id`) |
| `reservation_settings` · `reservation_managers`                                                      | Configuración (fila única) y gestores (`required_client_tag_id`, `notify_user_ids`, `user_id`)                                    |

### `appraisals` (`appraisals.ts`)

| Tabla              | Qué es (IDs de otros módulos)                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appraisals`       | Tasaciones. Se convierten en propiedad una sola vez (`requester_client_id`, `appraiser_user_id`, `producer_user_id`, `branch_id`, `location_id`, `converted_property_id`) |
| `appraisal_photos` | Fotos de la tasación                                                                                                                                                      |

### `portals` (`portals.ts`)

| Tabla                        | Qué es (IDs de otros módulos)                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `portal_accounts`            | Cuenta en cada portal, con las credenciales cifradas                               |
| `portal_listings`            | Publicación de una propiedad o un emprendimiento (`property_id`, `development_id`) |
| `portal_listing_daily_stats` | Vistas, contactos y favoritos por día                                              |

### `notifications` (`notifications.ts`)

| Tabla                      | Qué es (IDs de otros módulos)                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `notifications`            | Notificaciones, idempotentes por (`source_event_id`, `user_id`) (`user_id`, `entity_id`) |
| `notification_preferences` | Preferencias por tipo (`user_id`)                                                        |

### `conversations` (`conversations.ts`)

`conversations` y `conversation_messages`, de la `0000` (`client_id`).

### `audit` y plataforma (`platform.ts`)

| Tabla                                                   | Qué es                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `outbox`                                                | Eventos de dominio pendientes de publicar en pg-boss                                                      |
| `audit_log`                                             | Historial de cambios con el diff, `source`, `correlation_id` y `client_ids`. Solo de inserción            |
| `erasure_records`                                       | Constancia de una supresión de datos, sin datos personales                                                |
| `import_jobs` · `import_job_errors` · `import_mappings` | Importación de Tokko: corridas, errores por fila y equivalencia de IDs (`erased_at` marca los suprimidos) |

## Historial de cambios (`audit_log`)

- Lo escribe cada command en su transacción con el puerto `AuditLog` y los helpers `auditCreated`, `auditUpdated` y `auditAction` (`packages/core/src/shared/application/audit.ts`).
- `changes` es `{ campo: { before, after } }` con valores crudos. Los `bigint` se guardan como `{ "$bigint": "…" }` (`packages/infra/src/db/json.ts`).
- `client_ids` lleva los clientes cuyos datos aparecen en la entrada: la supresión borra por ese índice (GIN).
- **Solo de inserción, por código**: el puerto `AuditLog` solo tiene `record()` y ningún repositorio actualiza ni borra entradas. La única excepción es el caso de uso de supresión de datos (ADR 0015).
- Índices: por entidad (`entity_type`, `entity_id`, `occurred_at`), por tipo de entidad para Noticias (`entity_type`, `occurred_at desc`), `client_ids` y `correlation_id`.

## Roles y permisos del sistema

Es el modelo de ASP.NET Identity, en el módulo `identity`. No tiene nada que ver con los usuarios de Postgres: los tres procesos comparten un solo usuario de base (ADR 0015).

| Tabla              | Equivale a         | Qué es                                                            |
| ------------------ | ------------------ | ----------------------------------------------------------------- |
| `roles`            | `AspNetRoles`      | Grupos de permisos editables desde el panel                       |
| `role_permissions` | `AspNetRoleClaims` | Permisos de cada rol, `recurso:acción` (`recurso:*` otorga todas) |
| `user_roles`       | `AspNetUserRoles`  | Roles de cada usuario (pueden ser varios)                         |
| `user_permissions` | `AspNetUserClaims` | Permisos propios de un usuario: `grant` suma uno, `deny` lo quita |

Permisos efectivos de un usuario: la unión de los permisos de sus roles, más sus `grant`, menos sus `deny`. Esa regla vive en el dominio de `identity` (#3), y con el resultado se arma el `Actor` al iniciar sesión. Los casos de uso deciden con `actor.can(...)`.

Un rol asignado a algún usuario no se puede borrar (`user_roles.role_id` es `on delete restrict`). Al borrar un usuario se borran sus roles y permisos propios.

## Columnas a retirar en la migración contract

Se dejan en la `0001` porque el agente y la web todavía las leen. Se pasan a las tablas nuevas con un backfill y se borran cuando ya nadie las lea.

| Columna                                                                 | Reemplazo                        |
| ----------------------------------------------------------------------- | -------------------------------- |
| `properties.operation`, `properties.price_cents`, `properties.currency` | `property_operations`            |
| `properties.amenities`                                                  | `features` + `property_features` |
| `properties.image_urls`                                                 | `media_items`                    |
| `opportunities.notes`                                                   | `client_activities`              |

Después del backfill, también pasan a `not null` las columnas de autoría (`created_by`, `updated_by`) de las tablas de la `0000` y `opportunities.stage_id`.
