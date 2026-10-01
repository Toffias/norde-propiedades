# Decisiones de negocio

Registro de lo que Norde (o el equipo de SurisCode con Norde) decidió sobre **qué** hace el sistema. Las decisiones técnicas van en `docs/adr/`. Se mantiene con la skill `norde-negocio`, la entrada más nueva arriba.

Cada entrada: fecha, decisión, fuente (quién o dónde se decidió) y dónde impacta.

| Fecha      | Decisión                                                                                                                        | Fuente               | Impacto                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| 2026-10-01 | El sistema de gestión reemplaza a Tokko Broker y se migran sus datos                                                            | Ezequiel (SurisCode) | Épica #1, `docs/modulos/03-sistema-gestion.md` §13 |
| 2026-10-01 | El sistema es mono-tenant: Norde es la única inmobiliaria                                                                       | Ezequiel             | `CLAUDE.md` (Contexto del producto)                |
| 2026-10-01 | Toda grilla se pagina en el servidor, para no tener problemas de performance a futuro                                           | Ezequiel             | `CLAUDE.md` (Listados), `apps/gestion/CLAUDE.md`   |
| 2026-10-01 | No se construyen de Tokko: Chat, Red Tokko Broker, Calendario, Tareas, sincronización con Google Calendar y Outlook, Sitios web | Ezequiel             | Épica #1, fuera de alcance                         |
| 2026-10-01 | Reportes se definen cuando el sistema esté terminado                                                                            | Ezequiel             | Módulo `reporting`, pestaña Performance de Inicio  |
| 2026-10-01 | Las capturas del relevamiento de Tokko no se versionan (tienen datos reales de clientes); los issues enlazan al documento       | Ezequiel             | Issues de la épica #1, skill `tokko-paridad`       |

## Preguntas abiertas

Las preguntas abiertas de cada módulo están en su sub-issue de la épica #1 (sección "Preguntas abiertas") y en `docs/modulos/03-sistema-gestion.md` §12. Cuando se responde una, se marca en la issue y se agrega una fila arriba.
