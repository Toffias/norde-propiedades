# Módulo 3: Sistema de Gestión (panel de administración)

> Documento de detalle del módulo "Sistema de Gestión" de [diagrama-general.md](../diagrama-general.md).
> Es de **uso interno** del equipo de Norde Propiedades. Resuelve todo lo que no es el blog (el blog se maneja con Payload, ver [02-web-diseno-seo.md](02-web-diseno-seo.md)).

## 1. Objetivo

Un panel interno que sea la **fuente de verdad** del negocio:

- **Propiedades**: venta, alquiler y emprendimientos. Las consumen el sitio web, el agente de IA y los portales.
- **Clientes y oportunidades**, vengan del canal que vengan: WhatsApp, web chat, portales, carga manual.
- **Gestión de alquileres**: contratos, actualizaciones por IPC y avisos.
- **Tasaciones**, reportes, usuarios y auditoría.
- **Bandeja de conversaciones** del agente de IA, para tomar el control humano (ver módulo 1, sección 4.3).

```
          ┌─────────────┐   ┌──────────────┐   ┌───────────────────────────────┐
          │  Sitio web  │   │ Agente de IA │   │ Portales                      │
          │  (módulo 2) │   │  (módulo 1)  │   │ MercadoLibre, Zonaprop,       │
          │             │   │              │   │ Argenprop                     │
          └──────┬──────┘   └──────┬───────┘   └──────────────┬────────────────┘
       lee props │   lee props,    │           publica props, │
                 │   crea clientes │           trae consultas │
                 ▼                 ▼                          ▼
          ┌───────────────────────────────────────────────────────────────────┐
          │                   SISTEMA DE GESTIÓN (API + panel)                │
          │  Propiedades · Clientes · Alquileres · Tasaciones · Reportes      │
          │  Usuarios/roles · Auditoría · Conversaciones · Soporte interno    │
          └───────────────────────────────────────────────────────────────────┘
```

---

## 2. Usuarios, roles y trazabilidad

### 2.1 Gestión de usuarios y roles

Roles propuestos (a validar con Norde):

| Rol                              | Puede                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Administrador**                | Todo, incluida la gestión de usuarios, la configuración, las integraciones y todos los reportes |
| **Gerente / Broker**             | Ver y editar todo, reasignar clientes, ver reportes. No gestiona usuarios                       |
| **Agente / Asesor**              | Ver todas las propiedades. Editar las suyas. Ver y gestionar **sus** clientes y conversaciones  |
| **Administrativo de alquileres** | Contratos de alquiler, propietarios, inquilinos y actualizaciones                               |

- Los permisos se definen por recurso y acción (ver, crear, editar, borrar, exportar), para poder ajustar roles sin tocar código.
- Login con email y contraseña, con sesión segura. Se puede agregar 2FA opcional para administradores.

**Implementado (#2, ADR 0016):**

- Los cuatro roles existen como roles de sistema (migración `0002_system_roles`), con permisos por recurso. Un usuario puede tener varios roles, más permisos propios que suman (`grant`) o quitan (`deny`).
- Ingreso en `/ingresar` con email y contraseña:
  - Hasta 5 intentos por minuto por IP.
  - El error no distingue un email inexistente de una contraseña incorrecta.
  - "Recordarme" mantiene la sesión.
- Toda pantalla bajo `(panel)` exige sesión. Un usuario suspendido no puede entrar, aunque tenga la sesión abierta.
- Se auditan el ingreso, el ingreso fallido (contra el usuario, sin guardar el email) y la salida.
- Sin alta pública: los usuarios los da de alta un administrador desde Mi empresa (#3). El primero se crea con `pnpm user:create-admin` (producción) o `pnpm db:seed` (desarrollo, un usuario por rol).
- Sin recupero de contraseña por mail por ahora: la blanquea un administrador.
- El menú lateral se contrae a íconos (la preferencia queda guardada) y en mobile se abre como panel. Los módulos que todavía no tienen pantalla figuran deshabilitados ("Próximamente").

**Implementado (#3, usuarios):**

- **Catálogo de permisos** (`identity/domain/permission-catalog.ts`): los permisos que se pueden asignar, `recurso:acción`, agrupados como en Tokko (Contactos, Propiedades, Emprendimientos, Gerencia, Marketing, Configuración) más Alquileres y Empresa. Incluye los globales relevados en Tokko: cambiar el agente de un contacto, ver contactos de su sucursal o de otras, exportar más de 10 propiedades, edición rápida masiva, publicar en portales, etc. Un test verifica que los permisos sembrados en `0002` existan en el catálogo.
- **Mi empresa → Usuarios** (`/mi-empresa/usuarios`), grilla paginada en el servidor:
  - Activos o suspendidos, búsqueda por nombre o email (sin acentos), orden por nombre, email, último ingreso o alta.
  - **Alta** con nombre, email, teléfono, uno o más roles y una **contraseña temporal** (se puede generar).
  - **Edición** de los datos y los roles. Sin cambios no se audita nada.
  - **Suspender** cierra sus sesiones abiertas en la misma transacción; nadie se puede suspender a sí mismo. **Reactivar** le devuelve el acceso.
  - **Blanquear la contraseña**: el administrador pone una temporal y se cierran las sesiones del usuario.
- **Contraseña temporal**: quien entra con una (alta o blanqueo) va a `/cambiar-contrasena` y su sesión no tiene ningún permiso hasta elegir una propia, distinta de la temporal. Lo decide `ResolveSessionActor`, no la pantalla.
- Permisos de cada acción: `users:read`, `users:create`, `users:update` (datos y roles), `users:suspend` (suspender y reactivar), `users:reset-password`.
- Auditoría contra el usuario: `user.created` (nombre, email, teléfono, estado y roles), `user.updated` (solo lo que cambió), `user.suspended`, `user.reactivated`, `user.password-reset` y `user.password-changed` (sin valores: nunca se audita una contraseña ni su hash).
- Se registra el **último ingreso** de cada usuario (hook de sesión de Better Auth).
- Diferencias con Tokko: no hay "empresa" en el usuario (mono-tenant); la sucursal del usuario llega con el ABM de sucursales. La supervisión de ediciones de cartera y el 2FA quedan fuera por ahora (preguntas abiertas de #3).

**Implementado (#3, roles y permisos):**

- **Mi empresa → Roles** (`/mi-empresa/roles`): grilla paginada con búsqueda y cantidad de usuarios por rol, y su **papelera** (baja lógica, con restaurar).
- **Editor de rol**: nombre, descripción y permisos agrupados como el catálogo. "Todo" en un recurso guarda `recurso:*`, que también cubre las acciones que se agreguen después.
  - Los cuatro roles del sistema no se renombran ni se borran, pero sus permisos se ajustan.
  - Un rol con usuarios no se borra: hay que asignarles otro antes.
  - No puede haber dos roles con el mismo nombre (sin distinguir mayúsculas ni acentos), tampoco contra uno de la papelera.
  - Un cambio de permisos alcanza a todos los usuarios del rol desde su próxima acción (la sesión se arma en cada request).
- **Permisos propios** de un usuario (pestaña del panel lateral del usuario, `/mi-empresa/usuarios?panel=<id>&tab=permissions`): para cada permiso del catálogo, "según sus roles", "permitir" o "denegar". El panel muestra qué le dan ya sus roles. Denegar gana siempre, también sobre un `recurso:*`. Nadie cambia sus propios permisos.
- Permisos: `roles:read`, `roles:create`, `roles:update`, `roles:delete` (borrar, restaurar y ver la papelera) y `users:permissions` (dar o quitar permisos propios, aparte de editar usuarios).
- Auditoría: `role.created`, `role.updated` (con los permisos antes y después), `role.deleted`, `role.restored` contra el rol, y `user.permissions-changed` contra el usuario.
- La migración `0005` suma a los roles de sistema los recursos nuevos del catálogo (seguimientos, archivos, respuestas rápidas, etiquetas y equipos).

**Implementado (#3, reglas de pertenencia, ADR 0017):**

- "Lo suyo", "lo de su sucursal" y "lo de cualquiera" se deciden en el dominio (`identity/domain/ownership.ts`) con el dueño del registro, no solo con el permiso. Cada acción declara qué permiso cubre cada alcance (`OWNERSHIP_RULES`): por ejemplo, ver contactos usa `clients:read` (los suyos), `clients:read-branch` (su sucursal) y `clients:read-all` (todos).
- Un registro sin dueño es "de otros". Un usuario sin sucursal queda en lo suyo. Un `deny` corta el alcance más amplio.
- Los listados reciben el alcance como filtro (`visibilityFilter`) y lo resuelven en SQL.
- La sesión lleva la sucursal del usuario (`Actor.branchId`).
- Lo aplican los casos de uso de cada módulo a medida que se construyen (#5 a #12). El criterio "un agente sin `clients:export` no exporta" queda para la exportación de #8.

**Implementado (#3, sucursales y equipos):**

- **Mi empresa → Sucursales** (`/mi-empresa/sucursales`): grilla paginada con búsqueda, cantidad de usuarios y papelera.
  - Cada sucursal tiene nombre, dirección, email, teléfono, WhatsApp y logo. Se usan en portales y PDF. El logo es una URL hasta que exista la subida de archivos.
  - La primera sucursal es la **casa central**; desde la grilla se puede marcar otra (la anterior deja de serlo).
  - La casa central no se borra, ni una sucursal con usuarios o equipos.
  - "Ver usuarios" abre el panel lateral de la sucursal en la pestaña "Usuarios": sus usuarios activos, paginados. Se cambian de sucursal desde el panel de cada usuario.
- **Sucursal del usuario**: se elige en el alta y la edición con un selector paginado con búsqueda. La usan las reglas de pertenencia.
- **Mi empresa → Equipos** (`/mi-empresa/equipos`): grilla paginada con su sucursal, cantidad de miembros y papelera. Un equipo en la papelera conserva sus miembros.
  - En la pantalla del equipo, los miembros se listan paginados (es el listado de usuarios filtrado por equipo). Se suman con un buscador paginado y se sacan de a uno.
- No puede haber dos sucursales vigentes, ni dos equipos vigentes, con el mismo nombre (sin distinguir mayúsculas ni acentos).
- Permisos: `branches:read/create/update/delete` y `teams:read/create/update/delete`. Los miembros de un equipo se cambian con `teams:update`.
- Auditoría: `branch.created`, `branch.updated`, `branch.made-main`, `branch.deleted` y `branch.restored`; `team.created`, `team.updated`, `team.deleted`, `team.restored`, `team.member-added` y `team.member-removed` (contra el equipo, con el ID del usuario).

### 2.2 Trazabilidad de cambios (auditoría)

- Una tabla `audit_log` registra **quién** hizo el cambio, **cuándo**, **sobre qué** entidad e id, **qué acción** (crear, editar, borrar, exportar, iniciar sesión) y el **antes y después** de los campos cambiados.
- En cada ficha (propiedad, cliente, emprendimiento, contrato) hay una pestaña "Historial" que muestra quién cambió qué y cuándo, campo por campo. Por ejemplo: "Camila bajó el precio de venta de USD 120.000 a USD 115.000" o "Camila corrigió la dirección". Los cambios en datos dependientes (fotos, teléfonos, operaciones, etiquetas) aparecen en el historial de la ficha principal.
- Por ahora todos los usuarios son administradores y ven el historial completo.
- Las bajas son **lógicas** (soft delete): nada se borra físicamente desde el panel, **salvo la supresión de datos de un cliente** (Ley 25.326). Si el cliente lo pide, se borra todo lo vinculado a él, incluido su historial, y queda una constancia sin datos personales.
- Reglas y esquema: `CLAUDE.md` ("Auditoría e historial de cambios") e issue #19.
- Las exportaciones a Excel también quedan registradas, porque contienen datos personales.

---

## 3. Clientes

Se separan dos conceptos:

- **Cliente**: la persona. Es una sola, aunque haya llegado por varios canales.
- **Oportunidad**: cada consulta o interés concreto de ese cliente (por ejemplo, "busca alquilar 2 ambientes en Palermo", o "consultó por la propiedad X en Zonaprop"). Un cliente puede tener varias oportunidades a lo largo del tiempo.

### 3.1 Alta, baja y modificación

**Cliente:**

- **Datos personales**: nombre, apellido, teléfono (formato WhatsApp), email, DNI o CUIT (opcional).
- **Tipo** (puede tener más de uno): comprador, inquilino, propietario vendedor, propietario que alquila, inversor.
- **Canales de contacto**: lista de los canales por los que se comunicó (ver 3.3).
- **Seguimiento**: notas y actividad (historial de interacciones y conversaciones vinculadas).

**Oportunidad:**

- **Cliente** y **canal de origen**: WhatsApp (bot), web chat, formulario web, MercadoLibre, Zonaprop, Argenprop, referido, llamada, oficina. Es **clave para los reportes**.
- **Tipo**: venta, alquiler o tasación (la catalogación del agente de IA).
- **Propiedad consultada** (si la hay) y **búsqueda**: operación, tipo de propiedad, zonas, rango de precio y moneda, ambientes, amenities.
- **Estado**:
  - Nuevo → contactado → visitando → negociando → ganada o perdida.
  - **Aplica a otra inmobiliaria**: Norde no tiene hoy nada para ofrecerle. Lo marca el agente de IA o un asesor, para que el equipo revise si se le puede ofrecer algo de una **inmobiliaria socia**.
- **Próximas tareas**: llamar, visita agendada, etc.

**Vista "Aplica a otra inmobiliaria":**

- Bandeja filtrada con estas oportunidades, para revisarlas periódicamente.
- Campos extra: inmobiliaria socia a la que se derivó, fecha y resultado (derivada, sin opciones, volvió a Norde).
- Si más adelante entra stock que coincide con su búsqueda, la oportunidad puede volver a "nuevo".

### 3.2 Asignado a un agente

- Cada oportunidad (y por defecto el cliente) tiene un **agente responsable**.
- La asignación automática al entrar por el bot o por un portal puede ser por round-robin, por zona o por tipo de operación (a definir). Siempre se puede reasignar a mano.
- El agente asignado recibe un aviso cuando entra una oportunidad nueva o cuando el cliente vuelve a escribir.

### 3.3 Oportunidades cross platform

Se **persisten los clientes junto con el canal por el que se contactaron**, vengan de donde vengan:

| Canal                         | Cómo entra al sistema                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| **WhatsApp**                  | Lo registra el agente de IA (`register_client`), con la conversación vinculada                           |
| **Web chat**                  | Lo registra el agente de IA cuando el visitante deja teléfono o email                                    |
| **MercadoLibre**              | El conector trae las **preguntas y consultas** de los avisos por API                                     |
| **Zonaprop**                  | El conector trae los **contactos** que informa el portal (por API, webhook o mail, según lo que ofrezca) |
| **Argenprop**                 | Igual que Zonaprop                                                                                       |
| Formulario web y carga manual | Formulario de contacto y tasación de la web, o carga desde el panel                                      |

**Unificación del cliente (deduplicación):**

- Cada contacto nuevo se busca por **teléfono normalizado** (formato E.164, por ejemplo +54 9 11 …) y por **email**.
  - Si ya existe, se **agrega el canal** al cliente y se crea una **oportunidad nueva** (o se suma a la que tiene abierta por la misma propiedad).
  - Si no existe, se crea el cliente.
- Si la coincidencia es dudosa (mismo nombre, distinto teléfono), el sistema sugiere "posible duplicado" para que un humano decida si fusionar.

**Modelo de datos:**

- `client_channels`: cliente, canal, identificador en ese canal (teléfono, email, ID de usuario de MercadoLibre, ID de contacto del portal), primera y última interacción.
- `opportunities`: cliente, canal de origen, ID externo (pregunta de MercadoLibre, lead del portal), propiedad, tipo, estado, agente.

**Ficha del cliente:** una **línea de tiempo** con todo lo que pasó en todos los canales. Por ejemplo: "consultó en Zonaprop por la propiedad X → escribió al WhatsApp → chateó en la web".

### 3.3.1 Agenda de contactos en el panel (#8, etapa 1)

La issue #8 se parte en cuatro etapas: (1) agenda base, (2) etiquetas, agenda A–Z, empresas y grupos y unificar contactos, (3) actividad, notas, pestañas con contador, oportunidad en la ficha y buscador de propiedades embebido, (4) importación desde Excel y supresión de datos. Esta sección describe la etapa 1; la 3.3.2, la etapa 2; la 3.3.3, la etapa 3, y la 3.3.4, la etapa 4.

**Grilla** (`/contactos`): Nombre (con tipo de registro y tipos de cliente), Empresa, Teléfono, Celular, Email, Agente, Creación y Última actualización, paginada en el servidor y ordenable por nombre, creación y actualización.

- Cada usuario ve sus contactos, los de su sucursal o todos, según sus permisos (`clients:read`, `clients:read-branch`, `clients:read-all`). Se resuelve en SQL.
- Filtros: texto libre (nombre, teléfono, email, empresa o documento, sin acentos), tipo de cliente, "solo propietarios", agente, sucursal y rangos de creación y actualización. Los filtros por agente y sucursal se ofrecen a quien puede ver los usuarios y las sucursales.
- "Solo propietarios" filtra por tipo de cliente (propietario vendedor o que alquila) hasta que exista el propietario de cada propiedad.

**Alta** (panel lateral, `clients:create`): nombre, tipo de registro (persona, empresa o grupo), teléfonos con tipo y horario de contacto, emails, empresa, tipos de cliente y agente (otro agente pide `clients:reassign`). Antes de crear se buscan duplicados con la misma regla que usan el agente de IA y los portales:

- Mismo teléfono (con o sin el 9) o mismo email, en cualquiera de los teléfonos y emails del contacto: no se crea otro. Se ofrece abrir su ficha o, si está en la papelera, restaurarlo. Si es de un agente que el usuario no ve, se avisa a cargo de quién está.
- Mismo nombre (sin acentos ni mayúsculas) con otros datos: "posible duplicado", que se puede crear igual.
- Si un contacto de la papelera vuelve a escribir por un canal (agente de IA, portal), se restaura solo.

**Ficha** (`/contactos/[id]`): tarjeta con nombre, tipos, agente, teléfono y email principales, y las acciones WhatsApp, llamar, email, cambiar agente (`clients:reassign`) y borrar o restaurar. Secciones editables en línea: teléfonos y emails (el primero de cada lista es el principal), tipos de cliente, datos (tipo de registro, empresa, cargo, web, nacimiento, dirección, país, idioma y documento) y los canales por los que se contactó. Pestaña Historial con quién cambió qué y cuándo.

- Editar los propios pide `clients:update`; los de otros, `clients:update-others`. Cambiar el nombre pide además `clients:rename`.
- Un teléfono o email que ya usa otro contacto no se acepta en la edición.
- **Datos de propietarios**: sin `clients:read-owners`, los teléfonos, emails y documento de un propietario se ven enmascarados (`+54 •••• 9124`) en la grilla, la ficha y la exportación, y no se pueden editar.

**Papelera** (`?view=trash`, con permiso de borrar): quién borró y cuándo, con restaurar. Los propios con `clients:delete`, los de otros con `clients:delete-others`.

**Exportar a Excel** (`clients:export`): los contactos que cumplen los filtros aplicados, hasta 10.000, armado por lotes. Queda en la auditoría con el actor, los filtros y la cantidad.

### 3.3.2 Etiquetas, agenda A–Z, contactos relacionados y unificar (#8, etapa 2)

**Etiquetas** (`/contactos/etiquetas` y `/contactos/etiquetas/grupos`, con "Editar etiquetas" `tags:update`):

- Grupos de etiquetas (Origen, Alquileres, Colegas) con cuántas etiquetas y cuántos contactos activos tienen. Etiquetas sueltas o dentro de un grupo, con su contador de contactos.
- Crear, renombrar, mover de grupo, borrar y **unificar**: los contactos de una etiqueta pasan a otra (quien tenía las dos queda con una) y la primera se borra. Una etiqueta en uso no se borra; se unifica con otra o se quita de los contactos. Un grupo con etiquetas no se borra.
- En la ficha, la sección Etiquetas se edita con un selector paginado (hasta 50 por contacto). La edita quien puede editar el contacto y queda en su historial.
- Filtros de la agenda: con o sin etiquetas y una etiqueta puntual (en "Más filtros").

**Agenda A–Z** (`/contactos?layout=agenda`): índice alfabético con cuántos contactos hay en cada letra, con los filtros aplicados, y un acordeón. Solo la letra abierta trae sus contactos, paginados en el servidor (nunca la agenda completa). La inicial se toma sin acentos ("Álvaro" va en la A, "Ñandú" en la N) y lo que no empieza con una letra va en "#". La papelera se ve siempre en la grilla. Se suma el filtro por tipo de registro (persona, empresa o grupo).

**Contactos relacionados** (sección de la ficha, paginada):

- Una persona **trabaja en** una empresa; una persona o una empresa **es miembro de** un grupo; cualquier par puede estar **relacionado**, con un detalle libre ("esposa", "contador", "socio").
- La relación la declara un contacto y se ve desde los dos: en la ficha de la empresa aparece "Trabaja en esta empresa: Juan".
- Agregarla pide poder editar el contacto y ver el otro; quitarla, poder editar cualquiera de los dos. Se audita contra el contacto que la declara, con los dos IDs.

**Unificar contactos** (`clients:merge`, desde la tarjeta de la ficha):

- Se elige el otro contacto, se ven los dos lado a lado (datos, agente y lo que cuelga de cada uno) y se elige cuál queda.
- El principal se queda con todo: teléfonos, emails, canales, tipos de cliente, etiquetas, relaciones (las suyas y las que otros declaran hacia el duplicado), oportunidades, actividad, búsquedas guardadas, destacadas, envíos y consultas. Lo que ya tiene el principal manda (nombre, agente, teléfono y email principales, datos cargados); los datos vacíos se completan con los del duplicado. Si los dos tenían destacada la misma propiedad, la del duplicado pasa como quitada.
- El duplicado queda vacío en la papelera, apuntando al principal: no se lista ni se restaura, y su dirección redirige a la ficha del principal.
- Pide poder editar los dos. Un propietario cuyos datos el usuario no ve no se puede unificar.
- Queda en el historial de los dos, con el diff y cuántos registros de cada tipo se movieron. Se publica `clients.clients_merged` para que los otros módulos que guardan el ID del cliente lo reapunten.

### 3.3.3 Actividad, notas, oportunidades, destacadas y ofrecer (#8, etapa 3)

La ficha del contacto tiene pestañas en la URL (`?tab=actividad`), cada una paginada en el servidor y con su contador: Detalles, Actividad, Oportunidades, Destacadas, Búsquedas, Propiedades, Ofrecer e Historial.

**Tarjeta**: además de los datos de contacto, la oportunidad abierta más reciente con su estado y cuántas abiertas tiene; desde ahí se le cambia el estado, se cierra o se reasigna (§3.3.6). La estrella marca el contacto como favorito de quien lo mira (`user_favorites`, como las propiedades). "Agregar nota" lleva a la Actividad con el foco en la nota.

**Actividad** (`client_activities`), lo más reciente primero y con filtro por tipo:

- **Notas**: las agrega quien puede editar el contacto; quedan también en su historial.
- **Consultas**: cada oportunidad nueva, o una consulta repetida sobre una abierta, con lo que pidió. Las registra una reacción a `clients.opportunity_created` y `clients.opportunity_request_added`.
- **Conversaciones del agente de IA**: una entrada cuando la conversación queda vinculada al cliente (`conversations.conversation_linked_to_client`).
- **Unificaciones**: queda en el principal, con quién la hizo. La actividad del duplicado pasa al principal.
- **Cambios de estado**: cada cambio de estado o cierre de una oportunidad, con quién lo hizo (§3.3.6).
- Envíos, propiedades vistas y reacciones ya se muestran; los va a registrar #11.
- Las entradas que salen de un evento usan el ID del evento (una reentrega no las duplica) y no se auditan aparte: son la proyección de algo que ya quedó registrado.

**Oportunidades**: todas las del contacto (abiertas y cerradas), con su estado, origen y agente.

**Destacadas**: las propiedades destacadas vigentes, con su reacción. Quitar una la deja como quitada (no se borra) y se puede volver a destacar. Una propiedad que ya no está en la cartera queda sin datos.

**Búsquedas**: las búsquedas guardadas, en solo lectura (crearlas va con #11).

**Propiedades**: las de la cartera de las que es propietario (`property_owners`), desde el módulo properties.

**Ofrecer**: el buscador de la cartera de Norde (texto, operación y tipo) con "Destacar" por fila; la que ya está destacada lo dice. Destacar pide poder editar el contacto y ver la propiedad, y queda en el historial del contacto.

### 3.3.4 Importación desde Excel y supresión de datos (#8, etapa 4)

**Importar** (`/contactos/importaciones`, permiso `clients:import`): el historial de importaciones, paginado y con su estado (En proceso, Listo, Error). "Importar desde Excel" abre el panel lateral:

1. Se sube un `.xlsx` de hasta 10 MB y 10.000 filas, con los encabezados en la primera fila. Se lee en el momento (no se guarda) y se muestran las filas con datos.
2. Se elige qué columna va con cada dato: nombre, tipo de registro, empresa, teléfono, celular, teléfono laboral, email, otro email, tipos de cliente (separados por coma), cargo, web, dirección, país, número de documento y fecha de nacimiento. Los encabezados conocidos (los de la exportación de contactos y los habituales de una planilla) se proponen solos, con dos valores de ejemplo de cada columna. Hace falta el nombre (o la empresa) y al menos un teléfono o email.
3. Los contactos quedan a cargo de quien importa; elegir otro agente pide `clients:reassign`.

Al confirmar se guarda el archivo y un job de `apps/agent` (`clients.import_requested`) da de alta cada fila con **la misma regla de duplicados que el alta manual**: si el teléfono o el email ya existe (aunque esté en la papelera), la fila no se importa y el reporte enlaza al contacto que ya estaba. Cada fila va en su propia transacción junto con el avance: si el job se corta, retoma donde quedó, y si el evento llega dos veces no se importa de nuevo.

- Sin nombre ni empresa, sin teléfono ni email, o con un teléfono, email, tipo, fecha o largo inválido, la fila queda en el reporte con el dato que falló. El reporte no guarda datos personales: el número de fila, el motivo, la columna y, si era un duplicado, el ID del contacto.
- Sin nombre pero con empresa, el contacto se crea como empresa.
- Los contactos importados quedan auditados como `system:import`, agrupados por la importación (`correlation_id`). El pedido, el final y el fallo de la importación también se auditan.
- Al terminar se borra el archivo subido, que tiene datos personales.
- La pantalla se refresca sola mientras hay una importación en proceso.

**Suprimir datos** (Ley 25.326, permiso `clients:erase`): en la ficha del contacto, para cuando el cliente pide que se borren sus datos. Pide dos confirmaciones: primero se explica qué se borra y se carga la fecha del pedido; después hay que escribir el nombre del contacto (o `suprimir` si no tiene nombre).

- Se borra físicamente, sin papelera: la ficha con sus teléfonos, emails, canales, relaciones (en los dos sentidos) y etiquetas, las oportunidades, consultas, búsquedas, destacadas, envíos y actividad, y **sus entradas de `audit_log`** (las que lo tienen en `client_ids`). También se suprimen los duplicados que se le habían unificado, porque sus lápidas guardan nombre y datos de la ficha.
- Queda una constancia en `erasure_records` (fecha del pedido, quién la ejecutó, cuándo y el ID suprimido) y una entrada `client.erased` en la auditoría, sin datos personales.
- Los IDs externos del contacto (`import_mappings`) quedan marcados como suprimidos, para que una importación de Tokko no lo vuelva a crear.
- `clients.client_erased` hace que cada módulo borre lo suyo en el agente: las conversaciones del agente de IA con sus mensajes, los vínculos como propietario de una propiedad y como contacto comercial de un emprendimiento (las propiedades quedan) y los favoritos de todos los usuarios. Las reservas y las tasaciones todavía no tienen módulo: cuando lo tengan (#13 y #12), reaccionan al mismo evento.
- Los eventos del outbox solo llevan IDs. Los datos siguen en los backups hasta que rotan: falta documentar el plazo de retención.

### 3.3.5 Estados, motivos de cierre y reglas de oportunidades (#9, etapa 1)

Configuración en **Mi empresa → Oportunidades** (`/mi-empresa/oportunidades`). Cualquiera que puede ver la configuración la ve; para cambiarla hace falta `settings:update`. Alta y edición van en el panel lateral, y el orden se cambia arrastrando (o con el teclado).

**Estados** (ADR 0013): cada estado editable tiene nombre, color y orden, y pertenece a una **categoría fija del dominio**: nueva, contactado, visitando, negociando, ganada, perdida o aplica a otra inmobiliaria. La oportunidad guarda el estado (`stage_id`) y su categoría (`status`); las reglas y los reportes usan la categoría.

- De fábrica hay un estado por categoría (Nuevo, Contactado, Visitando, Negociando, Ganada, Perdida, Aplica a otra inmobiliaria). Norde los renombra, recolorea, ordena o agrega. El orden es el de las secciones de la lista y las columnas del tablero.
- La categoría de un estado no cambia después de crearlo. Hay hasta 30 estados.
- Un estado no se borra: se desactiva y deja de ofrecerse, pero las oportunidades que lo tienen lo conservan. No se puede desactivar el último estado activo de una categoría ni uno que use una regla automática.
- Entre estados de la misma categoría se pasa libremente. Entre categorías valen las transiciones del dominio (`InvalidStatusTransition`).
- A ganada o perdida solo se llega **cerrando con un motivo**. Ganada y perdida son finales.

**Motivos de cierre**: nombre, orden y calificación. Si es **positiva**, la oportunidad queda _ganada_; si es negativa o neutral, _perdida_. Cambiar la calificación no cambia las oportunidades ya cerradas. Hay hasta 50 motivos y tiene que quedar al menos uno activo. De fábrica: Compró o alquiló con Norde (positivo), Compró o alquiló con otra inmobiliaria, Dejó de buscar, No respondió (negativos) y Datos incorrectos o duplicado (neutral).

**Reglas automáticas**: el estado que aplica cada una. Solo se pueden elegir estados activos de categorías abiertas.

- **Al crear**: el estado de una oportunidad nueva (de fábrica, "Nuevo"). Si Norde no tiene stock para ofrecerle, nace en el primer estado de "Aplica a otra inmobiliaria".
- **Al asignar a un agente**, **al reactivar** (una derivada que vuelve a consultar) y **para propietarios**: se configuran acá y se aplican desde la etapa 4.
- Las reglas "tras enviar email o WhatsApp" y "tras me gusta / no me gusta" llegan con los envíos de fichas (#11).

**Historial y agente**: cada cambio de estado queda en `opportunity_status_changes` (estado y categoría de origen y destino, quién y cuándo). De ahí sale la **vigencia**, el tiempo en el estado actual. La oportunidad tiene agente y sucursal propios: al crearse hereda los del contacto. La migración pasó cada oportunidad al primer estado de su categoría, le copió el agente y la sucursal del contacto y le dejó su estado actual como primera entrada del historial.

Permisos nuevos de oportunidades, para las etapas siguientes: ver las de su sucursal o las de todas (`opportunities:read-branch` / `read-all`), editar las de otros (`opportunities:update-others`) y cambiar el agente (`opportunities:reassign`).

### 3.3.6 Pipeline de oportunidades en lista (#9, etapa 2)

**Oportunidades** (`/oportunidades`) muestra las oportunidades que el actor puede ver: las suyas, las de su sucursal (`opportunities:read-branch`) o todas (`opportunities:read-all`). La visibilidad usa el **agente y la sucursal de la oportunidad**, no los del contacto. Las de contactos en la papelera no aparecen.

- **Contadores**: arriba, un contador por estado con los filtros aplicados. Se muestran los estados activos y los desactivados que todavía tienen oportunidades. Tocar uno abre su sección.
- **Secciones**: un acordeón con una sección por estado, en el orden de Mi empresa. Hay una sola abierta a la vez (`?stageId=`), con sus oportunidades paginadas en el servidor. Sin estado en la URL se abre el primero que tiene oportunidades.
- **Orden**: actualizadas recientemente, más tiempo en el estado (vigencia), creadas recientemente, más antiguas o por contacto (A–Z).
- **Filtros**: texto del contacto (nombre, teléfono, email o documento), categoría, canal de origen, agente de la oportunidad, sucursal, etiqueta del contacto y rangos de creación y de última actualización.
- **Cada fila**: el contacto (con link a su ficha), qué busca, la propiedad por la que consultó, teléfono (enmascarado si es propietario y no se tiene "Ver datos de propietarios"), canal, agente, última actualización, la última nota del contacto y los días en el estado. Atajo a WhatsApp.

**Acciones** (en cada fila y en la tarjeta de la ficha del contacto). El menú ofrece solo lo que el dominio permite desde el estado actual:

- **Pasar a otro estado**: los activos de la misma categoría y los de las categorías a las que se puede pasar. Pide `opportunities:update` sobre la suya, o `opportunities:update-others`.
- **Cerrar**: con un motivo. Solo se ofrecen los motivos que llevan a una categoría alcanzable. Por ejemplo, desde "nueva" no se puede ganar: solo perder. La oportunidad va al primer estado activo de ganada o perdida.
- **Reasignar** (`opportunities:reassign`): cambia el agente de la oportunidad y la pasa a su sucursal, sin tocar el agente del contacto. Se puede dejar sin agente. Una oportunidad cerrada no se reasigna.
- Cada cambio de estado o cierre queda en el historial de estados, en la **actividad del contacto** ("Cambió el estado a…", con quién lo hizo) y en la auditoría con el diff (`opportunity.status_changed`, `opportunity.closed`, `opportunity.reassigned`). Reasignar emite `clients.opportunity_reassigned`, del que sale la regla "al asignar" en la etapa 4.

**Menú**: Oportunidades muestra cuántas oportunidades **nuevas** (categoría nueva) tiene asignadas quien entra.

**Ficha del contacto**: la tarjeta y la pestaña Oportunidades muestran el nombre y el color del estado (la categoría queda en el tooltip). La agenda de contactos suma el filtro **Estado de oportunidad** en Más filtros: los contactos con alguna oportunidad en ese estado.

### 3.4 Cruce de búsquedas con stock

Da soporte a las "Oportunidades por mail" del módulo 2.

- Cada oportunidad (o suscripción de la web) tiene una **búsqueda guardada**.
- Una tarea programada detecta **propiedades nuevas o bajas de precio** que coinciden.
- **Con suscripción por mail**: se le envía la alerta al cliente.
- **Sin suscripción**: se genera un aviso para el agente asignado ("hay una propiedad nueva para tu cliente X").

### 3.5 Exportar a Excel

- Exporta el listado con los filtros aplicados a `.xlsx`.
- Requiere un permiso específico y queda registrado en la auditoría.

---

## 4. Propiedades: Venta, Alquiler y Emprendimientos

Las tres comparten el mismo modelo base, con campos específicos según la operación.

### 4.1 Alta, baja y modificación

Campos comunes:

- **Identificación**: código interno, título, descripción, operación (venta / alquiler / alquiler temporario).
- **Tipo**: departamento, casa, PH, terreno, local, oficina, cochera, galpón.
- **Ubicación**: dirección, barrio, localidad, provincia y **latitud/longitud** (para el mapa). Opción de mostrar la dirección exacta o aproximada en la web.
- **Precio**: monto, moneda (ARS/USD), expensas, "precio a consultar".
- **Características**: ambientes, dormitorios, baños, cocheras, superficie total y cubierta, antigüedad, orientación, amenities, apto crédito, apto profesional.
- **Multimedia**: fotos (con orden y portada), videos, plano. Los archivos se guardan en el servicio en la nube para imágenes.
- **Estado**: borrador → disponible → reservada → vendida/alquilada, más pausada y dada de baja.
- **Publicación**:
  - "Publicar en web".
  - "**Destacada**", que alimenta los "Destacados" del módulo 2.
  - Portales donde se publica.
- **Relaciones**:
  - Propietario (un cliente de tipo propietario).
  - Agente captador.
  - Tasación de origen, si la hay.

**Emprendimientos** (desarrollos en pozo o en construcción):

- Ficha del emprendimiento: desarrolladora, estado de obra, fecha estimada de entrega, amenities del edificio y formas de pago.
- **Unidades**: cada unidad es una propiedad con su tipología, piso, superficie, precio y estado (disponible, reservada, vendida). Así se reutilizan el buscador, la web y los portales.

### 4.2 Exportar a Excel

Igual que en clientes: con filtros, con permiso y registrado en la auditoría.

### 4.3 Mapa de propiedades

- Vista de mapa en el panel, con los mismos filtros del buscador, una capa por estado y los pines agrupados cuando están cerca (§4.7).
- Proveedor: **Leaflet + OpenStreetMap**, y la dirección se geocodifica con **Nominatim** al dar de alta (ADR 0019).
- El mapa del sitio web puede usar la misma query cuando se construya.

### 4.4 Promociones (modal de la web)

- Alimenta las "Sugerencias al ingresar" del módulo 2: el modal que ve el visitante al abrir la web.
- **Alta, baja y modificación de promociones**:
  - Qué se promociona: emprendimiento, unidad o propiedad.
  - Imagen del modal (opcional; si no, la portada de la propiedad), título, texto y botón de acción.
  - Vigencia desde y hasta, activo o inactivo, y prioridad (si hay más de una activa).
- Métricas por promoción: vistas, clicks, cierres, y consultas generadas.
- Al guardar, se revalida la web (webhook).

### 4.5 Integraciones con portales

| Portal           | Qué se busca                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **MercadoLibre** | API oficial (OAuth). Publicar, actualizar y pausar avisos de inmuebles, y traer las **preguntas y consultas** como clientes |
| **Zonaprop**     | Publicación automática del stock. Hay que confirmar el mecanismo de integración (API de partners o feed XML) con el portal  |
| **Argenprop**    | Igual que Zonaprop: confirmar si hay API o feed XML para inmobiliarias                                                      |

Diseño propuesto:

- Un **conector por portal** con la misma interfaz: `publish`, `update`, `pause`, `unpublish` y `fetchLeads`.
- Una tabla `portal_listings` guarda la relación entre la propiedad, el portal, el ID externo, el estado y el último error.
- La sincronización es **asíncrona**, con una cola de trabajos y reintentos. Los errores se ven en el panel.
- Las consultas que llegan de los portales entran como **oportunidades con canal = portal**, unificadas con el cliente si ya existía (ver 3.3). Esto alimenta los reportes de orígenes.

> Riesgo: el acceso a las APIs de Zonaprop y Argenprop suele requerir un acuerdo comercial o ser partner. Conviene confirmarlo temprano; si no hay acceso, la alternativa es exportar un feed o cargar a mano.

---

### 4.6 Buscador, alta corta y papelera (#5)

La #5 se hace en dos etapas. La etapa 1 (la base) se describe acá; la etapa 2 (vistas, acciones masivas y catálogos) en §4.7.

**Buscador** (`/propiedades`):

- Es una query distinta de la búsqueda pública: ve borradores y datos internos.
- La cartera es de toda la inmobiliaria: con `properties:read` se ven todas. "Mis captaciones" y "Mi sucursal" son filtros.
- Filtros rápidos: texto (código, título o dirección), barrio / localidad / provincia, operación, tipo, estado, y moneda con rango de precio.
- El precio se filtra y se ordena en **una sola moneda**: sin moneda no hay rango ni orden por precio. Con operación elegida, el precio es el de esa operación.
- Orden por última actualización (por defecto), creación, precio o código.
- Todo paginado en el servidor, con un índice por filtro y orden (probado con 5.000 propiedades).

**Alta corta** (panel lateral del buscador, `?panel=new`):

- Tipo (solo los habilitados en Mi empresa), operación, moneda y precio (opcional), calle, altura, piso y unidad (privados), ubicación y latitud / longitud (opcional).
- La ubicación se busca en el catálogo (barrio, localidad y provincia salen de ella) o se carga a mano.
- Sin coordenadas, la dirección se geocodifica. Si no se encuentra o el servicio falla, la propiedad se crea igual y el alta lo avisa.
- La propiedad nace como **borrador**, con quien la carga como captador y su sucursal.
- El código de referencia sale de la numeración de Mi empresa (§14.2).
- Si se dejan vacías, la dirección para publicar se arma con la calle y la altura redondeada a la centena ("Gurruchaga al 1800"), y el título para portales con tipo, operación y barrio ("Departamento en venta en Palermo").
- El propietario se carga en la etapa 2: necesita el buscador de clientes (#8).

**Papelera**: borrar es baja lógica. Se ven quién la borró y cuándo, y se restaura. Borra o restaura sus propiedades quien tiene `properties:delete`, y las de cualquiera quien tiene `properties:delete-others`. Las propiedades de la papelera no aparecen en la web ni en el agente.

### 4.7 Vistas, acciones masivas y catálogos (#5, etapa 2)

**Vistas del buscador** (`?layout=`): lista, tarjetas y mapa, con los mismos filtros. La papelera solo se ve en lista.

- **Lista**: columnas fijas (código, propiedad, operación y precio, estado) más hasta 4 que elige la inmobiliaria en Mi empresa → Propiedades (ambientes, dormitorios, baños, cocheras, superficies, antigüedad, captador, alta, actualización). Valen para todos los usuarios, como en Tokko.
- **Tarjetas**: la foto de portada, el estado, el título, la ubicación, los precios y los atributos principales.
- **Mapa**: los pines del área visible, como mucho 500 (las actualizadas más recientemente). Una capa por estado y pines agrupados. Las propiedades sin coordenadas no aparecen.

**Favoritas y búsquedas favoritas** (de cada usuario):

- La estrella de cada fila o tarjeta marca la propiedad como favorita.
- "Búsquedas" guarda los filtros y el orden actuales con un nombre (hasta 50 por usuario). Con un nombre que ya existe, se reemplazan.

**Acciones masivas** sobre las propiedades marcadas o sobre todas las que cumplen el filtro:

- **Exportar** a Excel, CSV o PDF. Hasta 10 con `properties:export`; más, con `properties:export-bulk`. Se arma por lotes, hasta 5.000 filas (100 en PDF), y queda en la auditoría con el filtro y la cantidad. No incluye la dirección privada.
- **Favoritas**: solo sobre las marcadas en la página.
- **Comparar**: de 2 a 4 marcadas, lado a lado (precio, superficies, ambientes, dormitorios, baños, cocheras, antigüedad, ubicación y estado).
- **Edición rápida** (`properties:bulk-edit`, y sobre cada propiedad poder editarla): un campo por vez, hasta 2.000 propiedades, por lotes.
  - Estado: con las transiciones del dominio. "Disponible" exige `properties:mark-available`; "Reservada" no se elige a mano, la marca una reserva (#13).
  - Precio de una operación que la propiedad ya tiene (vacío: a consultar). Queda en el historial de precios.
  - Captador (`properties:change-producer`): la propiedad pasa a la sucursal del nuevo captador.
  - Etiquetas: agregar y quitar.
  - Las que no se pueden cambiar se informan con el motivo. Cada cambio queda en el historial de su propiedad.

**Transiciones de estado**: borrador → disponible o dada de baja; disponible → reservada, pausada, vendida, alquilada o dada de baja; reservada → disponible, vendida, alquilada o dada de baja; pausada → disponible o dada de baja; vendida o alquilada → disponible (se relista) o dada de baja; dada de baja → disponible o borrador.

**Mi empresa** (configuración con `settings:update`, etiquetas con `tags:update`):

- **Propiedades**: columnas del buscador y tipos de propiedad. Un tipo deshabilitado no se ofrece en el alta (sus propiedades siguen en la cartera); siempre queda al menos uno. Cada tipo elige qué atributos muestra su ficha, con una configuración recomendada para volver.
- **Ubicaciones**: país > provincia > localidad > barrio > subbarrio. El nivel es el siguiente al de la ubicación de la que depende. Vienen cargadas las provincias, los barrios de CABA, el Gran Buenos Aires y las ciudades principales. No se repite un nombre bajo el mismo padre.
- **Servicios y ambientes**: servicios, ambientes y adicionales. Un ítem no se borra: se desactiva.
- **Etiquetas**: sueltas o en grupos. Un grupo con etiquetas o una etiqueta en uso no se borran.

**Pendiente de #5**: el panel "Más filtros" (se define con Norde qué filtros sirven), el propietario en el alta (necesita el buscador de clientes, #8) y el envío por email o WhatsApp (#8 y #11). Las columnas viejas de `properties` se retiran en #33.

### 4.8 Ficha de propiedad (#6)

Pantalla propia en `/propiedades/[id]`, con las pestañas en la URL (`?tab=`). La grilla y las tarjetas del buscador enlazan a la ficha.

**Cabecera**: foto de portada, estado (con "Cambiar estado", con las transiciones de §4.7), tipo, código, ubicación, dirección para publicar y la real, favorita, "Publicación" (publicar en web, con o sin precio, dirección exacta y destacada, con `properties:publish`) y las acciones: ver en el mapa, vista previa de la web, estadísticas, PDF de la ficha, PDF de vidriera y reporte al propietario.

- "Publicar en web" se marca en cualquier estado: la web la muestra solo mientras está disponible.
- La vista previa muestra la propiedad como la vería un visitante (fotos para la web, dirección y precio según la publicación) aunque no esté publicada.

**Detalles**: cada bloque se edita en el lugar y guarda con su propio caso de uso, con el diff en el historial.

- Operaciones: venta, alquiler y temporario, cada una con precio, moneda, "precio a consultar" y comisión (0 a 100 %, con dos decimales). Al menos una. Cada cambio de precio va al historial de precios y emite `PropertyPriceChanged`.
- Condiciones: exclusividad, permuta, escritura inmediata, financiación, apto crédito y expensas (en pesos).
- Características: ambientes, superficies y medidas, antigüedad, orientación, estado de conservación y disposición. La superficie cubierta más la semicubierta no supera la total. Se muestran los atributos que el tipo de propiedad tiene habilitados en Mi empresa.
- Ubicación: dirección real (privada), dirección para publicar (vacía: se sugiere), ubicación del catálogo y coordenadas. Si cambia la dirección y no hay coordenadas cargadas a mano, se ubica de nuevo en el mapa.
- Título para portales y descripción. Servicios, ambientes y adicionales como checklists del catálogo. Etiquetas. Atributos personalizados (se definen en Mi empresa → Propiedades: texto, número, sí o no, o lista; no se borran ni cambian de tipo, se desactivan).
- Información interna: código de referencia (editable, sin repetir), captador (`properties:change-producer`), tasadores, usuario de mantenimiento, ubicación de las llaves, información legal y comentarios internos. Los propietarios se muestran; se cargan cuando exista el buscador de contactos (#8).

**Multimedia**: fotos y planos (JPG, PNG o WebP, hasta 15 MB, hasta 100 ítems por propiedad), videos (YouTube, Vimeo) y recorridos 360 (Matterport, Kuula, Roundme) por link.

- Se suben varias a la vez, con el avance de cada una. La primera es la portada.
- Se ordenan arrastrando. Por foto: portada, mostrar en la web, incluir en el PDF, es plano, rotar, descripción, bajar la original y borrar.
- La original no se modifica: un job genera la miniatura, la versión web y la copia con marca de agua (ADR 0020). Mientras tanto, la foto se ve "procesando".

**Archivos**: escrituras, reglamentos y planos (PDF, imágenes, Word o Excel, hasta 25 MB), con "Mostrar en la web", renombrar, bajar y borrar (baja lógica).

**Historial**: cada cambio con quién y cuándo, campo por campo (antes → después), paginado. Se filtra por tipo de cambio (datos, precio, estado, fotos y videos, archivos, publicación, captador y etiquetas) y por fechas. Los cambios de fotos y archivos aparecen en el historial de la propiedad. Ver el historial de lo propio pide `audit:read`; el de otros, `audit:read-others`.

**Contactos**: potenciales interesados (clientes con búsquedas guardadas que coinciden con la propiedad: misma operación, tipo, ubicación o una que la contiene, ambientes y precio en la misma moneda) e historial de envíos de la ficha con lo que hizo el cliente (abrió, le gustó, no le gustó). Solo los clientes que el usuario puede ver. Los envíos los crea #11.

**Estadísticas**: envíos por email y WhatsApp, interesados, consultas recibidas y publicaciones activas; gráfico mensual (3, 6, 12 o 24 meses, en hora de Buenos Aires); perfil de los interesados por etiqueta y publicaciones por portal.

**PDF** (con `properties:export`, queda en el historial): ficha (con las fotos marcadas para el PDF), vidriera (una hoja con una foto grande) y reporte al propietario de un período de hasta un año (publicaciones activas, visitas por portal, envíos, consultas e interesados). Siguen "Ficha y PDF" de Mi empresa (dirección al descargar, precio, agente). Los arma un job; el diálogo muestra el estado y se descargan cuando están listos. El reporte se puede mandar por email con el PDF adjunto: el email del propietario no queda en el historial.

**Pendiente de #6**: cargar propietarios (#8), compartir por email o WhatsApp (#11), "Completar con IA" y la tasación de origen (#12). Los interesados, envíos, consultas y publicaciones se ven vacíos hasta que #8, #10, #11 y #14 escriban esos datos. Descripción y PDF solo en español.

## 5. Alquiler: gestión de contratos

Además de la propiedad publicada en alquiler, cuando se concreta el alquiler se crea un **contrato**:

- **Datos del propietario**: cliente de tipo propietario, datos de contacto, datos bancarios para liquidaciones (si Norde administra el cobro).
- **Datos de la propiedad**: referencia a la propiedad (dirección, unidad, inventario).
- **Datos del inquilino**: cliente de tipo inquilino y **garantes** (tipo de garantía: propietaria, seguro de caución, recibo de sueldo).
- **Contrato de alquiler**:
  - Fecha de inicio y de fin, duración, monto inicial, moneda, día de pago.
  - Depósito, punitorios.
  - Adjuntos: contrato firmado en PDF, inventario, fotos de entrega.
  - Estado: vigente, por vencer, vencido, rescindido o renovado.

### Actualizaciones por IPC con notificación

- Cada contrato define el **índice** (IPC, u otro como ICL o CAC si hiciera falta) y la **periodicidad** de actualización (trimestral, cuatrimestral, semestral, anual).
- **Cálculo automático**: se toma la serie oficial del IPC del INDEC (hay API pública en datos.gob.ar), se calcula el nuevo monto para la próxima fecha de actualización y se guarda el historial de montos.
- **Notificaciones**:
  - N días antes de cada actualización: aviso al administrativo y al agente, y opcionalmente al inquilino y al propietario (mail o template de WhatsApp) con el monto nuevo.
  - Aviso de **vencimiento de contrato**, por ejemplo a los 90, 60 y 30 días, para gestionar la renovación.
- **Revisión humana**: el monto calculado queda "pendiente de confirmar" hasta que alguien lo aprueba, y recién ahí se notifica al inquilino.

> A definir: ¿Norde también administra cobranzas y liquidaciones al propietario (recibos, comisiones)? Es un submódulo grande que no aparece en el diagrama.

---

## 6. Tasaciones

### 6.1 Alta, baja y modificación

- **Solicitante**: cliente propietario. Puede entrar desde el agente de IA con la tool `request_appraisal`.
- **Datos de la propiedad**: dirección, tipo, superficies, ambientes, estado y fotos.
- **Tasador asignado** y fecha de visita.
- **Resultado**: valor sugerido de venta o alquiler (mínimo y máximo), comparables, observaciones.
- **Estado**: solicitada → visita agendada → tasada → convertida / descartada.
- Opcional: generar un **informe de tasación en PDF** con la marca de Norde.

### 6.2 Convertir a venta

- Con un botón se crea una **propiedad en venta** (o en alquiler) prellenada con los datos de la tasación, en estado borrador.
- La propiedad queda vinculada a la tasación y al propietario, para medir la conversión de tasaciones en captaciones en los reportes.

---

## 7. Reportes

### 7.1 Ventas y orígenes

- Operaciones cerradas (ventas y alquileres) por período, agente, tipo de propiedad y zona.
- **Origen** de cada operación: qué canal trajo al cliente que cerró.
- Montos y comisiones (si se cargan).
- Tiempo promedio de venta o alquiler.

### 7.2 Clientes y orígenes

- Clientes nuevos por período y por origen: bot de WhatsApp, web chat, portales, referido, etc.
- Embudo de conversión por origen (nuevo → contactado → visita → cierre).
- Clientes por agente y tiempo de primera respuesta.
- Catalogación del bot: cuántos fueron venta, alquiler, tasación u otra inmobiliaria.
- Oportunidades en "Aplica a otra inmobiliaria": cuántas hay, cuántas se derivaron a socias y cuántas volvieron a Norde. Sirve para detectar **qué stock falta**, por ejemplo zonas o tipos muy pedidos.
- Clientes que llegaron por **más de un canal**.

### 7.3 Extra sugerido

- **Costo por canal**: tokens de OpenAI y mensajes de WhatsApp por mes. El bot ya registra el uso por turno.
- **Estado de publicaciones en portales**: publicadas, con error, pausadas.

---

## 8. Agente de soporte interno

Un asistente de IA dentro del panel, para el equipo de Norde:

- **Soporte en dudas generales**: responde "¿cómo cargo un emprendimiento?", "¿cómo convierto una tasación en venta?", etc.
  - Se basa en un **manual de uso** del sistema (documentos markdown), con búsqueda sobre el manual (RAG simple, o incluido en el prompt si el manual es corto).
  - Reutiliza el núcleo del agente del módulo 1, con otras instrucciones y otras tools.
- **Derivar a soporte real**: si no sabe responder o hay un error, crea un ticket o envía un mail al soporte técnico (SurisCode) con el contexto: usuario, pantalla y conversación.
- Opcional, más adelante: tools de solo lectura para consultas como "¿cuántas propiedades en alquiler tenemos en Palermo?".

---

## 9. Transversal

- **Bandeja de conversaciones** (del módulo 1):
  - Ver conversaciones de WhatsApp y del web chat.
  - Tomar el control, responder y devolver al bot.
  - Filtrar por agente y por estado.
- **Sin API interna**: el sitio web, el agente de IA y los jobs llaman a los **mismos casos de uso** de `@norde/core`, contra la misma base (ver [arquitectura.md](../arquitectura.md)).
- **Archivos**: fotos, planos y PDFs en Cloudflare R2 (S3 compatible, ADR 0018), con thumbnails optimizados. El bucket es privado: el panel sirve cada archivo después de autorizarlo.
- **Notificaciones**: un servicio único (panel, mail, WhatsApp) que usan los alquileres, los clientes asignados y las oportunidades.
- **Tareas programadas**: cálculo de IPC, avisos de vencimiento, sincronización con portales y cruce de oportunidades. Corren como jobs de pg-boss en el proceso `apps/agent`.
- **Backups** diarios de la base de datos.

---

## 10. Stack y arquitectura

El stack, la estructura del monorepo, las capas y las reglas están en **[docs/arquitectura.md](../arquitectura.md)**.

Resumen de lo que aplica a este módulo:

- **`apps/gestion`** (Next.js 16) es **solo presentación**: pantallas, Server Actions delgadas y login (Better Auth).
- Toda la lógica de este documento (clientes, oportunidades, propiedades, alquileres, IPC, tasaciones, reportes) vive en **`@norde/core`**, organizada por módulo. La usan también el agente de IA y la web.
- Los jobs (IPC, vencimientos, portales, alertas) y los webhooks de portales corren en **`apps/agent`**, un proceso separado.
- Específico del panel:
  - Tablas con TanStack Table y paginación del lado del servidor.
  - Formularios con react-hook-form y los mismos schemas Zod del core.
  - Exportaciones con `exceljs`.
  - Mapa con Leaflet + OpenStreetMap (o Google Maps).

> Alternativa evaluada: armar el sistema de gestión dentro del admin de Payload, que trae alta, baja y modificación, roles y versiones de fábrica. Se descarta porque la idea es usar Payload solo para contenido editorial, y porque la gestión (alquileres, IPC, portales, bandeja de conversaciones) necesita pantallas y flujos a medida.

---

## 11. Plan de trabajo sugerido

| Fase                    | Alcance                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **F1: Base**            | Autenticación, usuarios y roles, auditoría, estructura del panel                                                                   |
| **F2: Propiedades**     | Alta, baja y modificación de venta, alquiler y emprendimientos; fotos; mapa; exportar a Excel; API de lectura para la web y el bot |
| **F3: Clientes**        | Alta, baja y modificación, asignación a agente, orígenes, exportar a Excel; recibir clientes del bot                               |
| **F4: Conversaciones**  | Bandeja y handoff con el agente de IA                                                                                              |
| **F5: Alquileres**      | Contratos, IPC, notificaciones, vencimientos                                                                                       |
| **F6: Tasaciones**      | Alta, baja y modificación, convertir a venta                                                                                       |
| **F7: Portales**        | MercadoLibre primero (API pública), después Zonaprop y Argenprop según el acceso                                                   |
| **F8: Reportes**        | Ventas y orígenes, clientes y orígenes                                                                                             |
| **F9: Soporte interno** | Manual de uso y agente de soporte                                                                                                  |

---

## 12. Preguntas abiertas

1. **Migración**: ✅ Definido. Norde usa **Tokko Broker**; este sistema lo reemplaza y hay que migrar sus datos (ver §13 y la sub-issue de migración).
2. **Cobranzas de alquileres**: ¿están en alcance?
3. **Comisiones**: ¿se registran en el sistema para los reportes de ventas?
4. **Cuántos usuarios** y roles reales tiene el equipo.
5. **Portales**: ¿Norde ya tiene cuentas activas en Zonaprop y Argenprop? ¿Con qué plan o acceso?
6. **"Oportunidades cross platform"**: ✅ Definido (sección 3.3).
7. **Inmobiliarias socias**: ¿se registran en el sistema, con contacto y zonas? ¿Hay acuerdo de comisión por referido que convenga registrar?

---

## 13. Reemplazo de Tokko Broker

El sistema de gestión reemplaza a **Tokko Broker**, el CRM que Norde usa hoy (4.642 contactos y 173 propiedades al 30/09/2026). La referencia funcional es el relevamiento de Tokko (documento privado en claude.ai, enlazado desde la épica). El backlog es la épica [#1](https://github.com/Toffias/norde-propiedades/issues/1), con una sub-issue por módulo:

| Fase                      | Sub-issues                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Base                   | #19 modelo de datos y migración inicial (va primero) · #2 base del panel · #3 usuarios, roles y sucursales · #4 configuración de la empresa |
| 2. Cartera                | #5 propiedades · #6 ficha de propiedad · #7 emprendimientos                                                                                 |
| 3. Clientes y comercial   | #8 contactos · #9 oportunidades · #10 consultas · #11 seguimiento comercial                                                                 |
| 4. Operaciones y portales | #12 tasaciones · #13 reservas · #14 difusión en portales                                                                                    |
| 5. Tablero y avisos       | #15 inicio · #16 noticias y notificaciones                                                                                                  |
| 6. Migración y corte      | #17 migración desde Tokko (el mapeo se diseña en la fase 1; el corte va al final)                                                           |

### 13.1 Fuera de alcance

Decidido el 01/10/2026: Chat, Red Tokko Broker (y el inventario de Zonaprop en el buscador, redes y asociaciones, comisión compartida con colegas), Calendario y eventos, Tareas, sincronización con Google Calendar y Outlook, Reportes (y la pestaña Performance de Inicio, que se definen al terminar el sistema), Sitios web (los reemplaza `apps/web`), Facturación y API key de Tokko, e integración Asiprop (la reemplaza el módulo `rentals`, §5).

### 13.2 Reglas que surgen del reemplazo

- **Mono-tenant**: Norde es la única inmobiliaria. La configuración "por tenant" de Tokko es un único registro de configuración de la empresa.
- **Todas las grillas se paginan en el servidor** (ver `CLAUDE.md`, "Listados: siempre paginados en el servidor").
- **Cliente y oportunidad separados** (§3). En Tokko el contacto _es_ la oportunidad; acá un cliente tiene varias oportunidades y el pipeline muestra oportunidades.
- El modelo de datos del relevamiento (C# / EF Core, multi-tenant) es solo referencia de campos: se rediseña en Drizzle por módulo.
- Las capturas del relevamiento tienen datos reales de clientes: no se copian al repo, ni a issues ni a PRs.

---

## 14. Mi empresa: configuración de la empresa (#4)

Módulo `settings`. Es un único registro de configuración (mono-tenant). Todo cambio queda en el historial con su diff. La configuración la ve y la cambia solo el Administrador (`settings:*`).

### 14.1 Secciones

| Sección (`/mi-empresa/…`) | Qué guarda                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General                   | Nombre, logo, zona horaria (por defecto `America/Argentina/Buenos_Aires`), alcance de Noticias. También guarda la URL de propiedades y de emprendimientos en la web (con `{id}` o `{slug}`), pero por ahora no se edita desde el panel |
| Marca de agua             | Logo, tamaño (5 % a 50 % del ancho), posición (9), opacidad. Se aplica a las fotos de portales y PDF; hay vista previa sobre una foto de muestra, sin guardar                                                                          |
| Portales                  | Pie de la descripción con variables: `{codigo}`, `{telefono_sucursal}`, `{email_sucursal}`, `{whatsapp_sucursal}`, `{url_web}`. Otra variable es un error                                                                              |
| Email                     | Nombre del remitente y dirección de respuesta. La dirección de envío y la API key de Resend van por entorno. Botón de email de prueba (queda en el historial)                                                                          |
| Códigos                   | Prefijos por tipo de propiedad y exclusivos por usuario, equipo o sucursal                                                                                                                                                             |
| Ficha y PDF               | Contacto de la empresa, datos del agente, precio, dirección al enviar y al descargar (exacta, aproximada u oculta), fotos del emprendimiento en las unidades                                                                           |
| Archivos                  | Gestor de archivos de la empresa                                                                                                                                                                                                       |

### 14.2 Códigos de referencia

- Si aplican varios prefijos, gana el más específico: usuario, equipo, sucursal, tipo de propiedad y, por último, el general (`P`), que siempre existe y no se borra.
- Cada prefijo tiene su propio correlativo; el código es el prefijo + 4 dígitos (`CAS0012`). Dos numeraciones no pueden compartir prefijo.
- El número se toma de forma atómica: dos altas en paralelo nunca reciben el mismo. La numeración saltea los códigos ya cargados a mano; puede haber huecos, nunca repetidos.
- Cambiar un prefijo no cambia los códigos ya entregados.
- La edición manual del código en la ficha llega con #5.

### 14.3 Gestor de archivos

- Carpetas en árbol (hasta 8 niveles), con nombre único dentro de cada carpeta. Archivos de hasta 25 MB: PDF, documentos, planillas, imágenes y ZIP.
- Borrar un archivo lo manda a la papelera, que es paginada y permite restaurar. Una carpeta se borra solo sin subcarpetas ni archivos activos; sus archivos de la papelera pasan a la raíz.
- Permiso `company-files`: el Administrador hace todo; Gerente y Agente ven, descargan y suben.

### 14.4 Diferencias con Tokko

- Fuera de alcance: facturación y plan, API key, redes y asociaciones, tipos de evento. La configuración de oportunidades, propiedades, reservas, respuestas rápidas y seguimientos vive en la sub-issue de cada módulo.
- Las credenciales del proveedor de email no se cargan en el panel: van por variables de entorno.
