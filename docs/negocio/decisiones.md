# Decisiones de negocio

Registro de lo que Norde (o el equipo de SurisCode con Norde) decidió sobre **qué** hace el sistema. Las decisiones técnicas van en `docs/adr/`. Se mantiene con la skill `norde-negocio`, la entrada más nueva arriba.

Cada entrada: fecha, decisión, fuente (quién o dónde se decidió) y dónde impacta.

| Fecha      | Decisión                                                                                                                                                                       | Fuente               | Impacto                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | -------------------------------------------------- |
| 2026-10-01 | Cada usuario del panel tiene uno o varios roles (grupos de permisos editables) y puede tener permisos propios que suman o quitan, como en ASP.NET Identity                     | Ezequiel             | #19, #3, ADR 0015                                  |
| 2026-10-01 | Todo cambio queda en el historial de la entidad (quién, qué, cuándo, antes y después), y un cliente puede pedir la supresión física de sus datos                               | Ezequiel             | #19, `CLAUDE.md` (Auditoría)                       |
| 2026-10-01 | El Postgres de producción corre en un Linux de Hostinger administrado por nosotros, con `pg_trgm` y `unaccent` para la búsqueda de texto                                       | Ezequiel             | #19, `docs/arquitectura.md` §10                    |
| 2026-10-01 | Las sucursales se modelan aunque Norde tenga una sola                                                                                                                          | Ezequiel             | #19, módulo `identity`                             |
| 2026-10-01 | La comisión de una reserva puede cargarse como porcentaje, como monto o ambos (los dos opcionales)                                                                             | Ezequiel             | #19, #13                                           |
| 2026-10-01 | Las reservas son parte del módulo de propiedades: reservar cambia el estado de la propiedad en la misma operación                                                              | Ezequiel             | #19, #13                                           |
| 2026-10-01 | Los estados de oportunidad los edita Norde (nombre, color, orden); cada uno pertenece a una categoría fija (nueva, contactada, visita, negociación, ganada, perdida, derivada) | Ezequiel             | #19, #9, ADR 0013                                  |
| 2026-10-01 | El sistema de gestión reemplaza a Tokko Broker y se migran sus datos                                                                                                           | Ezequiel (SurisCode) | Épica #1, `docs/modulos/03-sistema-gestion.md` §13 |
| 2026-10-01 | El sistema es mono-tenant: Norde es la única inmobiliaria                                                                                                                      | Ezequiel             | `CLAUDE.md` (Contexto del producto)                |
| 2026-10-01 | Toda grilla se pagina en el servidor, para no tener problemas de performance a futuro                                                                                          | Ezequiel             | `CLAUDE.md` (Listados), `apps/gestion/CLAUDE.md`   |
| 2026-10-01 | No se construyen de Tokko: Chat, Red Tokko Broker, Calendario, Tareas, sincronización con Google Calendar y Outlook, Sitios web                                                | Ezequiel             | Épica #1, fuera de alcance                         |
| 2026-10-01 | Reportes se definen cuando el sistema esté terminado                                                                                                                           | Ezequiel             | Módulo `reporting`, pestaña Performance de Inicio  |
| 2026-10-01 | Las capturas del relevamiento de Tokko no se versionan (tienen datos reales de clientes); los issues enlazan al documento                                                      | Ezequiel             | Issues de la épica #1, skill `tokko-paridad`       |

## Preguntas abiertas

Las preguntas abiertas de cada módulo están en su sub-issue de la épica #1 (sección "Preguntas abiertas") y en `docs/modulos/03-sistema-gestion.md` §12. Cuando se responde una, se marca en la issue y se agrega una fila arriba.
