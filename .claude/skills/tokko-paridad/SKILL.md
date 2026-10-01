---
name: tokko-paridad
description: Guía para implementar o refinar una sub-issue de la épica #1 (reemplazo de Tokko Broker en el panel de gestión). Usala cuando la tarea mencione una issue de la épica, "como en Tokko", el relevamiento de Tokko, o una funcionalidad del panel que Tokko ya tenía (contactos, oportunidades, consultas, propiedades, emprendimientos, difusión, tasaciones, reservas, configuración). Dice qué construir, qué no, y cómo adaptarlo a Norde.
---

# Paridad con Tokko Broker

El panel (`apps/gestion`) reemplaza a Tokko Broker. Paridad **no** es copiar Tokko: es cubrir lo que Norde usa, adaptado a esta arquitectura y a una sola inmobiliaria.

## Fuentes

- **Épica**: https://github.com/Toffias/norde-propiedades/issues/1 (`gh issue view 1 --repo Toffias/norde-propiedades`). Tiene las reglas transversales, lo que queda afuera y las diferencias de modelo.
- **Sub-issue del módulo**: alcance en checklist, criterios de aceptación, preguntas abiertas y links a la sección y las capturas del relevamiento.
- **Relevamiento funcional de Tokko Broker**: documento privado de Claude Docs, id `EZHjbkg8Cy3JnZ7CNEYDGS` (los links están en cada issue). Para leerlo, cargá la skill de docs del cliente (o el `guide` del conector de docs) y usá sus herramientas de lectura; nunca lo bajes con fetch o curl.
  - Para leer solo una sección: `read` del outline del tab y después la vista de esa sección, no el documento entero.
  - Las capturas son bloques `media` con un `blob`. Se pueden mirar para entender una pantalla (blob → asset con `read`, y el asset con `Artifact read`), pero **tienen datos reales de clientes**: no las copies al repo, a issues, a PRs ni a commits, y borrá la copia local al terminar.

## Módulos de Tokko → sub-issues → core

| Tokko                                                                 | Sub-issue | Módulo del core                         |
| --------------------------------------------------------------------- | --------- | --------------------------------------- |
| Modelo de datos propuesto (todas las entidades, migración inicial)    | #19       | todos (`packages/infra/src/db/schema/`) |
| Elementos globales (menú, Crear, buscador, notificaciones, favoritos) | #2        | `shared`, `apps/gestion`                |
| Mi empresa: usuarios, permisos, sucursales y equipos                  | #3        | `identity`                              |
| Mi empresa: general, códigos, ficha y PDF, archivos                   | #4        | `settings` (propuesto)                  |
| Propiedades: buscador, alta, tipos, etiquetas, mapa, papelera         | #5        | `properties`                            |
| Ficha de propiedad                                                    | #6        | `properties`, `audit`                   |
| Emprendimientos                                                       | #7        | `properties`                            |
| Contactos                                                             | #8        | `clients`                               |
| Oportunidades                                                         | #9        | `clients`                               |
| Consultas                                                             | #10       | `clients`, `portals`                    |
| Destacadas, búsquedas, envíos, respuestas rápidas, seguimientos       | #11       | `clients`                               |
| Tasaciones                                                            | #12       | `appraisals`                            |
| Reservas                                                              | #13       | a definir                               |
| Difusión                                                              | #14       | `portals`                               |
| Inicio (Pendientes, Estado actual)                                    | #15       | `reporting`                             |
| Noticias, notificaciones, configuración personal                      | #16       | `audit`, `notifications` (propuesto)    |
| Importar / migración                                                  | #17       | jobs + casos de uso de cada módulo      |

**Fuera de alcance** (no lo construyas aunque aparezca en el relevamiento): Chat, Red Tokko Broker y todo lo de colegas y redes, inventario de Zonaprop en el buscador, Calendario, eventos y tipos de evento, Tareas, Google Calendar / Outlook, Reportes y la pestaña Performance, Sitios web, Facturación, API key, Asiprop. Si una tarea lo necesita, frená y preguntá.

## Adaptaciones obligatorias

| En Tokko                                                  | En Norde                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Multi-tenant (`tenant_id`, RLS, configuración por tenant) | Mono-tenant: sin `tenant_id`; configuración = un único registro                     |
| El contacto _es_ la oportunidad                           | Cliente y oportunidad separados; el pipeline muestra oportunidades                  |
| Estados libres configurables                              | Estados del dominio con transiciones validadas (ver #9 si se vuelven configurables) |
| Grillas de 100/200/300 filas, agenda completa             | Todo paginado en el servidor, también kanban, agenda por letra y selects            |
| Modelo C# / EF Core, `numeric(18,2)`                      | TypeScript + Drizzle por módulo, `Money` en centavos `bigint`, sin FK entre módulos |
| Lógica en pantallas y configuraciones                     | Reglas en el dominio, autorización en el caso de uso, reacciones por eventos        |

## Cómo trabajar una sub-issue

1. Leé la issue completa y sus comentarios. Si hay preguntas abiertas que bloquean lo que vas a construir, preguntá antes de codear.
2. Leé la sección del relevamiento enlazada. Mirá las capturas solo si el texto no alcanza para entender la pantalla.
3. Leé el contexto de negocio con la skill `norde-negocio` (glosario y decisiones).
4. Proponé un corte chico: una o pocas casillas del checklist por PR. Commits chicos, rama `feat/<modulo>-<desc>`.
5. Construí con la skill `gestion-feature`.
6. En el PR: qué casillas cubre (`Parte de #<n>`), en qué se aparta de Tokko y por qué, y cómo se verificó.
7. Al terminar: marcá las casillas en la issue, actualizá `docs/modulos/03-sistema-gestion.md` y registrá las decisiones nuevas con `norde-negocio`.
