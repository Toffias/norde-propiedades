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
- Login con email y contraseña, con sesión segura, y verificación en dos pasos opcional para cada usuario (#113).

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
  - **Edición** de los datos y los roles. Sin cambios no se audita nada. Nadie cambia sus propios roles, como pasa con los permisos: con eso se podría dar cualquier permiso.
  - **Suspender** cierra sus sesiones abiertas en la misma transacción; nadie se puede suspender a sí mismo. **Reactivar** le devuelve el acceso.
  - **Blanquear la contraseña**: el administrador pone una temporal y se cierran las sesiones del usuario.
- **Contraseña temporal**: quien entra con una (alta o blanqueo) va a `/cambiar-contrasena` y su sesión no tiene ningún permiso hasta elegir una propia, distinta de la temporal. Lo decide `ResolveSessionActor`, no la pantalla.
- **Cambiar la contraseña propia** cierra las demás sesiones del usuario y deja abierta la del cambio: quien haya entrado con la contraseña vieja o con la temporal no sigue adentro.
- Permisos de cada acción: `users:read`, `users:create`, `users:update` (datos y roles), `users:suspend` (suspender y reactivar), `users:reset-password`.
- Auditoría contra el usuario: `user.created` (nombre, email, teléfono, estado y roles), `user.updated` (solo lo que cambió), `user.suspended`, `user.reactivated`, `user.password-reset` y `user.password-changed` (sin valores: nunca se audita una contraseña ni su hash).
- Se registra el **último ingreso** de cada usuario (hook de sesión de Better Auth).
- Diferencias con Tokko: no hay "empresa" en el usuario (mono-tenant); la sucursal del usuario llega con el ABM de sucursales. La supervisión de ediciones de cartera queda fuera por ahora (pregunta abierta de #3); el 2FA llegó con #113.

**Implementado (#113, verificación en dos pasos, ADR 0044):**

- **Opcional para todos los usuarios**, con app autenticadora (TOTP) y 10 códigos de respaldo de un uso. Plugin `twoFactor` de Better Auth.
- **Mi cuenta** (`/mi-cuenta`, desde el menú de la cuenta): cambiar la contraseña y activar, desactivar o generar códigos de respaldo nuevos, siempre confirmando la contraseña.
  - Activar: QR (o la clave para cargarla a mano), el primer código de la app y los códigos de respaldo para copiar o descargar. Hasta confirmar el primer código no queda activa.
  - Desactivar pide una sesión de menos de un día.
- **Ingreso**: con la verificación activa, después de la contraseña se pide el código de la app o uno de respaldo; sin el código no hay sesión.
  - "No pedir el código en este dispositivo por 30 días".
  - El desafío vence a los 10 minutos o con 5 códigos incorrectos (vuelve a pedir la contraseña); 10 incorrectos seguidos bloquean la cuenta 15 minutos.
- **Recuperación**: si se perdieron el celular y los códigos, un administrador con `users:reset-password` le quita la verificación desde Mi empresa → Usuarios (acción de la fila, solo en quien la tiene activa). Vuelve a entrar solo con la contraseña.
- Auditoría contra el usuario: `user.signed-in` con el factor usado (`secondFactor`), `user.sign-in-failed` con el motivo y el factor, `user.two-factor-enabled`, `user.two-factor-disabled`, `user.two-factor-backup-codes-regenerated` y `user.two-factor-reset`.

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
- Un registro sin dueño es "de otros". Un `deny` corta el alcance más amplio.
- Los listados reciben el alcance como filtro (`visibilityFilter`) y lo resuelven en SQL.
- La sesión lleva la sucursal del usuario (`Actor.branchId`).
- Lo aplican los casos de uso de cada módulo a medida que se construyen (#5 a #12). El criterio "un agente sin `clients:export` no exporta" queda para la exportación de #8.

**Implementado (#3, sucursales y equipos):**

- **Mi empresa → Sucursales** (`/mi-empresa/sucursales`): grilla paginada con búsqueda, cantidad de usuarios y papelera.
  - Cada sucursal tiene nombre, dirección, email, teléfono, WhatsApp y logo. Se usan en portales y PDF. El nombre y el WhatsApp son obligatorios. El logo es una URL hasta que exista la subida de archivos.
  - **Contacto en los PDF** (opcional, #175): texto libre de hasta 6 renglones. Si está, las fichas, la vidriera y los informes de la sucursal lo muestran en lugar de la dirección, los teléfonos y el email, y en lugar del texto de Mi empresa.
  - Todo usuario está en una sucursal (obligatoria en su alta y edición). La migración `0036` mandó a la casa central a los que no tenían y les copió el teléfono como WhatsApp a las sucursales sin él. `pnpm user:create-admin` y `pnpm db:seed` crean la casa central si la base no tiene ninguna (el primero pide `--whatsapp`).
  - La primera sucursal es la **casa central**; desde la grilla se puede marcar otra (la anterior deja de serlo).
  - La casa central no se borra, ni una sucursal con usuarios o equipos.
  - "Ver usuarios" abre el panel lateral de la sucursal en la pestaña "Usuarios": sus usuarios activos, paginados. Se cambian de sucursal desde el panel de cada usuario.
- **Sucursal del usuario**: se elige en el alta y la edición con un selector paginado con búsqueda. La usan las reglas de pertenencia.
- **Mi empresa → Equipos** (`/mi-empresa/equipos`): grilla paginada con su sucursal, cantidad de miembros y papelera. Un equipo en la papelera conserva sus miembros.
  - En la pantalla del equipo, los miembros se listan paginados (es el listado de usuarios filtrado por equipo). Se suman con un buscador paginado y se sacan de a uno.
- No puede haber dos sucursales vigentes, ni dos equipos vigentes, con el mismo nombre (sin distinguir mayúsculas ni acentos).
- Permisos: `branches:read/create/update/delete` y `teams:read/create/update/delete`. Los miembros de un equipo se cambian con `teams:update`.

> **Equipos, oculto (#50).** Norde no tiene equipos en Tokko. Con `TEAMS_ENABLED=false` (por defecto) en `apps/gestion`, la pestaña no se muestra, `/mi-empresa/equipos` responde 404 y Roles y Usuarios no ofrecen los permisos `teams:*` (un rol que ya los tiene los conserva).

- Auditoría: `branch.created`, `branch.updated`, `branch.made-main`, `branch.deleted` y `branch.restored`; `team.created`, `team.updated`, `team.deleted`, `team.restored`, `team.member-added` y `team.member-removed` (contra el equipo, con el ID del usuario).

**Implementado (#17, usuarios de Tokko):**

- **Traer usuarios de Tokko** (en Usuarios, con `users:create` y la API key de Tokko configurada; decidido el 2026-10-21: "la copia tiene que quedar tal cual"). Un job (`identity.tokko_users_import_requested`) copia los usuarios de la cuenta de Norde en Tokko, para que los contactos y las propiedades queden a cargo de los mismos agentes. Tarda unos minutos.
  - Los **vigentes** en Tokko (`/user/`) se crean **activos**; los que **ya no están** (agentes de contactos que no son usuarios: se encuentran recorriendo todos los contactos) se crean **suspendidos**: figuran como agentes pero no entran. Uno sin email recibe uno que nunca se entrega (`tokko-<id>@usuarios-tokko.invalid`).
  - Todos con el rol **Agente / Asesor** y la **sucursal principal**, con el celular de Tokko y **sin contraseña**: entran cuando un administrador les blanquea una.
  - "**Libre**" y "**Sin Asignar**" no se copian: en Tokko son bolsas de contactos sin agente.
  - Uno que ya está en Norde con el mismo email o el mismo nombre no se crea ni se cambia: se puede volver a traer sin duplicar.
  - Se auditan como `user.imported` (y `user.suspended`), como `system:import`.
  - Cada corrida queda guardada (en espera, en proceso, terminada con el resumen o con error) y se sigue desde las notificaciones de la barra (§9). Queda auditada como `user.tokko_import_finished`.

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
- La asignación automática de las consultas de portales y de la web va por reglas (canal, operación, tipo, zona, propiedad, emprendimiento) con reparto ponderado entre agentes (#10, etapa 3). Siempre se puede reasignar a mano.
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
- **Datos de propietarios**: sin `clients:read-owners`, los teléfonos, emails y documento de un propietario se ven enmascarados (`+54 •••• 9124`) en la grilla, la ficha y la exportación, y no se pueden editar. Tampoco se le puede quitar el tipo de propietario, que es lo que los oculta.

**Papelera** (`?view=trash`, con permiso de borrar): quién borró y cuándo, con restaurar. Los propios con `clients:delete`, los de otros con `clients:delete-others`.

**Exportar a Excel** (`clients:export`): los contactos que cumplen los filtros aplicados, hasta 10.000, armado por lotes. Queda en la auditoría con el actor, los filtros y la cantidad.

### 3.3.2 Etiquetas, agenda A–Z, contactos relacionados y unificar (#8, etapa 2)

**Etiquetas** (`/contactos/etiquetas` y `/contactos/etiquetas/grupos`, con "Editar etiquetas" `tags:update`):

- Grupos de etiquetas (Origen, Alquileres, Colegas) con cuántas etiquetas y cuántos contactos activos tienen. Etiquetas sueltas o dentro de un grupo, con su contador de contactos.
- Crear, renombrar, mover de grupo, borrar y **unificar**: los contactos de una etiqueta pasan a otra (quien tenía las dos queda con una) y la primera se borra. La unificación queda en el historial de la etiqueta de destino y en el de cada contacto que cambió (sus etiquetas de antes y de después); los contactos se recorren por lotes, en la misma transacción. Una etiqueta en uso no se borra; se unifica con otra o se quita de los contactos. Un grupo con etiquetas no se borra.
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
- La unión respeta las reglas de la ficha: si el principal no puede tener una relación del duplicado (por ejemplo, una empresa no "trabaja en" otra) o juntos pasan el tope de 50 relaciones o de 50 etiquetas, no se unifica y se avisa qué corregir. No se descarta nada en silencio.
- Las relaciones que **otros** contactos declaran hacia el duplicado pasan igual, aunque no encajen con el tipo del principal (alguien que "trabaja en" una empresa que se unifica en una persona): son datos de esos otros contactos. Antes de confirmar, la pantalla avisa cuántas no encajan para revisarlas después.
- Queda en el historial de los dos, con el diff y cuántos registros de cada tipo se movieron. El historial del principal muestra también el del duplicado.
- El mapeo con Tokko pasa al principal en la misma transacción: una reimportación resuelve al contacto que quedó.
- **Lo de los otros módulos también pasa al principal**, al recibir `clients.clients_merged` (en segundos, por el agente):
  - Propiedades: sus reservas, las propiedades de las que es propietario (si los dos eran dueños de la misma, queda uno) y el contacto comercial de los emprendimientos. Cada propiedad y emprendimiento lo deja en su historial (`property.client_merged`, `development.client_merged`).
  - Las conversaciones del agente de IA, con sus mensajes (`conversation.client_merged`).
  - Las tasaciones que pidió el duplicado (`appraisal.client_merged`).
  - Los favoritos de cada usuario: quien tenía a los dos queda con uno (`user.favorites_merged`).
- Las unificaciones anteriores a esto se corrigieron con la migración `0029`, siguiendo las cadenas (un principal que después se unificó a otro).

### 3.3.3 Actividad, notas, oportunidades, destacadas y ofrecer (#8, etapa 3)

La ficha del contacto tiene pestañas en la URL (`?tab=actividad`), cada una paginada en el servidor y con su contador: Detalles, Actividad, Oportunidades, Destacadas, Búsquedas, Propiedades, Ofrecer e Historial.

**Tarjeta**: además de los datos de contacto, la oportunidad abierta más reciente con su estado y cuántas abiertas tiene; desde ahí se le cambia el estado, se cierra o se reasigna (§3.3.6). La estrella marca el contacto como favorito de quien lo mira (`user_favorites`, como las propiedades). "Agregar nota" lleva a la Actividad con el foco en la nota.

**Actividad** (`client_activities`), lo más reciente primero y con filtro por tipo:

- **Notas**: las agrega quien puede editar el contacto; quedan también en su historial.
- **Consultas**: cada oportunidad nueva, o una consulta repetida sobre una abierta, con lo que pidió. Las registra una reacción a `clients.opportunity_created` y `clients.opportunity_request_added`.
- **Conversaciones del agente de IA**: una entrada cuando la conversación queda vinculada al cliente (`conversations.conversation_linked_to_client`).
- **Unificaciones**: queda en el principal, con quién la hizo. La actividad del duplicado pasa al principal.
- **Cambios de estado**: cada cambio de estado o cierre de una oportunidad, con quién lo hizo (§3.3.6).
- **Envíos**, **aperturas** (la primera vez que abre el link) y **reacciones** ("me gusta" / "no me gusta"): los registran los casos de uso de envíos (§3.3.10); las aperturas y reacciones figuran como hechas por el contacto.
- Las entradas que salen de un evento usan el ID del evento (una reentrega no las duplica) y no se auditan aparte: son la proyección de algo que ya quedó registrado.

**Oportunidades**: todas las del contacto (abiertas y cerradas), con su estado, origen y agente.

**Destacadas**: las propiedades destacadas vigentes, con su coincidencia y su reacción (§3.3.10). Quitar una la deja como quitada (no se borra) y se puede volver a destacar. Una propiedad que ya no está en la cartera queda sin datos.

**Búsquedas**: las búsquedas guardadas, con alta, edición, papelera y restauración (§3.3.10).

**Propiedades**: las de la cartera de las que es propietario (`property_owners`), desde el módulo properties.

**Ofrecer**: el buscador de la cartera de Norde (texto, operación y tipo) con "Destacar" por fila; la que ya está destacada lo dice. Destacar pide poder editar el contacto y ver la propiedad, y queda en el historial del contacto.

### 3.3.4 Importación desde Excel y supresión de datos (#8, etapa 4)

**Importar** (`/contactos/importaciones`, permiso `clients:import`): el historial de importaciones, paginado y con su estado (En proceso, Listo, Error). "Importar contactos" abre el panel lateral:

1. Se sube un `.xlsx`, un `.xls` (la exportación de contactos de Tokko sale así) o un `.csv`, de hasta 10 MB y 10.000 filas, con los encabezados en la primera fila. El servidor reconoce el formato por el contenido (ADR 0038), lo lee en el momento (no se guarda) y muestra las filas con datos. El navegador no procesa el archivo.
2. Se elige qué columna va con cada dato: ID de Tokko, nombre, tipo de registro, empresa, teléfono, celular, teléfono laboral, otro teléfono, email, otro email, tipos de cliente (separados por coma), cargo, web, dirección, país, número de documento, fecha de nacimiento, agente y etiquetas. Los encabezados conocidos (los de la exportación de contactos, los de la de Tokko y los habituales de una planilla) se proponen solos, con dos valores de ejemplo de cada columna. Hace falta el nombre (o la empresa) y al menos un teléfono o email.
3. Los contactos quedan a cargo de quien importa; elegir otro agente pide `clients:reassign`.
4. La columna del agente pide `clients:reassign` y la de etiquetas, `tags:update`: sin el permiso no se ofrecen ni se proponen.

**Exportación de Tokko** (parte de la migración, #17):

- Un guion (`-`, `---`) es una celda vacía: Tokko lo pone, por ejemplo, en todas las fechas de nacimiento.
- **ID de Tokko**: se guarda como ID externo del contacto (`import_mappings`, origen `tokko`). Al reimportar, una fila con un ID ya importado no se crea de nuevo ("Ya se importó antes"), aunque sus datos hayan cambiado en Tokko; actualizar los contactos ya importados queda para la última corrida antes del corte. Una fila duplicada por teléfono o email queda vinculada a ese ID, y una cuyo contacto pidió la supresión no se vuelve a crear.
- **Agente**: el usuario con ese nombre (sin distinguir mayúsculas ni acentos), también uno suspendido: los contactos de quien ya no está en Tokko quedan a su nombre (por eso conviene traer antes los usuarios de Tokko, §2.1). "Libre" y "Sin Asignar" (bolsas de Tokko) dejan el contacto **sin agente**, en la sucursal de la importación. Si no hay un usuario con ese nombre, el contacto queda a cargo del agente de la importación.
- **Etiquetas**: separadas por `|` (como en Tokko) o por coma. Se busca una etiqueta suelta (sin grupo) con ese nombre y, si no hay, se crea suelta. Se auditan el alta de cada etiqueta y las etiquetas del contacto.
- **Oportunidad** (en Tokko el contacto es la oportunidad): con la columna del estado, cada contacto creado lleva una, también las cerradas. Pide `opportunities:create` y `settings:update` (puede crear motivos de cierre).
  - Nace ya en su estado, sin recorrer las transiciones ni disparar "oportunidad creada": no avisa al equipo, no aplica reglas ni suma actividad. Se audita como `opportunity.imported`.
  - Estado: "Pendiente contactar" → el primer estado activo de Nuevo; "Tomar Accion" → de Contactado; "Cerrado" → de Ganada o Perdida según el motivo.
  - Motivo ("Motivo (nota)"): "Alquilo/Compro con nosotros" → "Compró o alquiló con Norde"; "…con otro" → "Compró o alquiló con otra inmobiliaria"; "Fantasma" → "No respondió"; "Sin seguimiento" → "Dejó de buscar"; "Es Propietario - Tasación exitosa" → "Tasación exitosa" (ganada); el resto o vacío → "Otro" (perdida). Se busca por nombre y, si no existe, se crea. La nota entre paréntesis (y el motivo, si no se conocía) queda como nota de la oportunidad; una de menos de 3 letras o números se descarta.
  - Origen: el primero de la lista, con un canal por portal (Zonaprop, MercadoLibre, Argenprop, Icasas, Properati, OLX, Liderprop, EnBuenosAires y Reporte Inmobiliario); "Sitio Web" → formulario de la web; sin origen o desconocido → Oficina.
  - Tipo: por el motivo ("Alquiló…" alquiler, "Compró…" venta, tasación) y, si no, por las etiquetas ("Tasacion"; "Alquiler" sin "Venta"); el resto, venta.
  - Fechas: "Fecha de creación" es el alta y "Ultima actualización", el último cambio de estado (el cierre, si está cerrada).
  - Un contacto que ya existía (duplicado o importado antes) no suma oportunidad.
- La sucursal y las propiedades destacadas de la exportación no se importan.

Al confirmar se guarda el archivo y un job de `apps/gestion` (`clients.import_requested`, ADR 0021) da de alta cada fila con **la misma regla de duplicados que el alta manual**: si el teléfono o el email ya existe (aunque esté en la papelera), la fila no se importa y el reporte enlaza al contacto que ya estaba. Cada fila va en su propia transacción junto con el avance: si el job se corta, retoma donde quedó, y si el evento llega dos veces no se importa de nuevo.

- Sin nombre ni empresa, sin teléfono ni email, con más de 50 etiquetas, o con un teléfono, email, tipo, fecha o largo inválido, la fila queda en el reporte con el dato que falló. El reporte no guarda datos personales: el número de fila, el motivo, la columna y, si era un duplicado, el ID del contacto.
- Sin nombre pero con empresa, el contacto se crea como empresa.
- Los contactos importados quedan auditados como `system:import`, agrupados por la importación (`correlation_id`). El pedido, el final y el fallo de la importación también se auditan.
- Al terminar se borra el archivo subido, que tiene datos personales.
- La pantalla se refresca sola mientras hay una importación en proceso.

**Suprimir datos** (Ley 25.326, permiso `clients:erase`): en la ficha del contacto, para cuando el cliente pide que se borren sus datos. Pide dos confirmaciones: primero se explica qué se borra y se carga la fecha del pedido; después hay que escribir el nombre del contacto (o `suprimir` si no tiene nombre).

- Se borra físicamente, sin papelera: la ficha con sus teléfonos, emails, canales, relaciones (en los dos sentidos) y etiquetas, las oportunidades, consultas, búsquedas, destacadas, envíos y actividad, y **sus entradas de `audit_log`** (las que lo tienen en `client_ids`). También se suprimen los duplicados que se le habían unificado, porque sus lápidas guardan nombre y datos de la ficha.
- Queda una constancia en `erasure_records` (fecha del pedido, quién la ejecutó, cuándo y el ID suprimido) y una entrada `client.erased` en la auditoría, sin datos personales.
- Los IDs externos del contacto (`import_mappings`) quedan marcados como suprimidos, para que una importación de Tokko no lo vuelva a crear.
- `clients.client_erased` hace que cada módulo borre lo suyo en el agente: las conversaciones del agente de IA con sus mensajes, los vínculos como propietario de una propiedad y como contacto comercial de un emprendimiento (las propiedades quedan), sus reservas (si una estaba activa, la propiedad vuelve a estar disponible; ver §4.9) los favoritos de todos los usuarios y las tasaciones que pidió (ver §6.4).
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
- **Tras enviar email o WhatsApp**, **tras "me gusta"** y **tras "no me gusta"** (#104): mueven la oportunidad abierta a la que quedó atado el envío. Las aplica el mismo job que las demás, idempotente por evento (`clients.listings_sent`, `clients.listing_reacted`).

**Historial y agente**: cada cambio de estado queda en `opportunity_status_changes` (estado y categoría de origen y destino, quién y cuándo). De ahí sale la **vigencia**, el tiempo en el estado actual. La oportunidad tiene agente y sucursal propios: al crearse hereda los del contacto. La migración pasó cada oportunidad al primer estado de su categoría, le copió el agente y la sucursal del contacto y le dejó su estado actual como primera entrada del historial.

Permisos nuevos de oportunidades, para las etapas siguientes: ver las de su sucursal o las de todas (`opportunities:read-branch` / `read-all`), editar las de otros (`opportunities:update-others`) y cambiar el agente (`opportunities:reassign`).

### 3.3.6 Pipeline de oportunidades en lista (#9, etapa 2)

**Oportunidades** (`/oportunidades`) muestra las oportunidades que el actor puede ver: las suyas, las de su sucursal (`opportunities:read-branch`) o todas (`opportunities:read-all`). La visibilidad usa el **agente y la sucursal de la oportunidad**, no los del contacto. Las de contactos en la papelera no aparecen.

- **Tarjetas por estado**: arriba de la lista, una tarjeta por estado con su total y los filtros aplicados. Se muestran los estados activos y los desactivados que todavía tienen oportunidades. Tocar una filtra la lista a ese estado (`?estado=`); tocarla otra vez lo quita y deja abierta esa sección.
- **Secciones**: un acordeón con una sección por estado, en el orden de Mi empresa, con la cabecera tenida con el color del estado. Hay una sola abierta a la vez (`?stageId=`): trae su primera página y "Ver más" suma la siguiente (paginada en el servidor, sin tocar la URL); tocar su cabecera la colapsa. Sin estado en la URL se abre el primero que tiene oportunidades. "Seleccionar las cargadas" va en la cabecera de la sección abierta, a la izquierda del nombre.
- **Orden**: uno solo para todos los estados, dentro de "Más filtros" (un botón de ícono, con el número de filtros aplicados), en lista y tablero: actualizadas recientemente, más tiempo en el estado (vigencia), creadas recientemente, más antiguas o por contacto (A–Z). Cambiar de sección mantiene el orden.
- **Agente por defecto**: sin agente en la URL se ven las oportunidades de quien entra. Quitar el agente en "Más filtros" muestra las de todos (`?agentId=todos`). Solo aplica a quien puede elegir agente (`users:read`); si no, no tendría cómo quitarlo.
- **Filtros**: texto del contacto (nombre, teléfono, email o documento), categoría, canal de origen, agente de la oportunidad, sucursal, etiqueta del contacto y rangos de creación y de última actualización.
- **Cada fila**: el contacto (con link a su ficha), qué busca, la propiedad por la que consultó, teléfono (enmascarado si es propietario y no se tiene "Ver datos de propietarios"), canal, agente, última actualización, la última nota del contacto y los días en el estado. Atajo a WhatsApp.

**Acciones** (en cada fila y en la tarjeta de la ficha del contacto). El menú ofrece solo lo que el dominio permite desde el estado actual:

- **Pasar a otro estado**: los activos de la misma categoría y los de las categorías a las que se puede pasar. Pide `opportunities:update` sobre la suya, o `opportunities:update-others`.
- **Cerrar**: con un motivo. Solo se ofrecen los motivos que llevan a una categoría alcanzable. Por ejemplo, desde "nueva" no se puede ganar: solo perder. La oportunidad va al primer estado activo de ganada o perdida.
- **Reasignar** (`opportunities:reassign`): cambia el agente de la oportunidad y la pasa a su sucursal, sin tocar el agente del contacto. Se puede dejar sin agente. Una oportunidad cerrada no se reasigna.
- Cada cambio de estado o cierre queda en el historial de estados, en la **actividad del contacto** ("Pasó a…", con el estado anterior y quién lo hizo) y en la auditoría con el diff (`opportunity.status_changed`, `opportunity.closed`, `opportunity.reassigned`). Reasignar emite `clients.opportunity_reassigned`, del que sale la regla "al asignar" en la etapa 4.

**Menú**: Oportunidades muestra cuántas oportunidades **nuevas** (categoría nueva) tiene asignadas quien entra.

**Ficha del contacto**: la tarjeta y la pestaña Oportunidades muestran el nombre y el color del estado (la categoría queda en el tooltip). La agenda de contactos suma el filtro **Estado de oportunidad** en Más filtros: los contactos con alguna oportunidad en ese estado.

### 3.3.7 Tablero de oportunidades e historial (#9, etapa 3)

**Tablero** (`/oportunidades?vista=tablero`): el mismo pipeline, con los mismos filtros y el mismo orden, en columnas. "Lista" y "Tablero" se alternan arriba a la derecha; los filtros se mantienen.

- **Columnas**: una por estado, en el orden de Mi empresa (los activos y los desactivados que todavía tienen oportunidades), con su contador. Cada columna trae su primera página (20) y pide la siguiente al llegar al final de su scroll. Ninguna trae más que su página.
- **Tarjeta**: el contacto (con link a su ficha), qué busca, la propiedad por la que consultó, la última nota, los días en el estado y la última actualización. Accesos a **nota**, **historial**, WhatsApp y el menú de acciones de la lista (pasar a otro estado, cerrar, reasignar).
- **Arrastrar** (con el mouse, el dedo o el teclado, desde el ícono de la tarjeta) a otra columna cambia el estado. Mientras se arrastra, las columnas a las que el dominio no deja pasar se ven atenuadas. Si igual se suelta ahí, el servidor lo rechaza (`InvalidStatusTransition`), la tarjeta vuelve a su lugar y se avisa por qué.
- **Soltar en ganada o perdida** abre el diálogo de cierre: solo con los motivos que cierran en esa categoría (positivo gana; negativo o neutral pierde), y la oportunidad queda en ese estado. Si no hay ninguno posible (desde "nueva" no se gana), se avisa y no pasa nada.
- Solo se arrastran las que el actor puede cambiar (las suyas, o todas con `opportunities:update-others`) y que están abiertas.

**Nota de la oportunidad**: se escribe desde la tarjeta. La agrega quien puede cambiar la oportunidad, aunque el contacto sea de otro agente. Queda en el historial de la oportunidad, en la actividad del contacto y en su auditoría (`client.note_added`, con el ID de la oportunidad).

**Historial** (modal, desde la tarjeta): lo que quedó atado a la oportunidad, lo más reciente primero, paginado en el servidor y filtrable por tipo: notas, cambios de estado, consultas, envíos, propiedades vistas, reacciones y conversaciones del agente de IA. Lo ve quien ve la oportunidad. Las notas del contacto que no se escribieron sobre la oportunidad quedan solo en la actividad del contacto.

**Cambios de estado**: desde esta etapa guardan el estado editable de origen y de destino. La actividad (en el historial y en la ficha del contacto) muestra "Pasó a "Visitando"" con el nombre de hoy del estado y "Estaba en…". Las entradas anteriores muestran la categoría.

### 3.3.8 Acciones masivas, reglas automáticas y derivadas (#9, etapa 4)

**Acciones masivas** (en la lista, por sección): se marcan oportunidades de la página, o se eligen **todas las del estado** con los filtros aplicados. "Cambiar…" ofrece:

- **Pasar a otro estado** (abierto y activo) y **cerrar con un motivo**: piden poder editar al menos las suyas.
- **Reasignar** (o dejarlas sin agente): pide `opportunities:reassign`.
- Cada oportunidad se chequea por separado: la que el actor no ve, no puede cambiar, está cerrada o no puede pasar a ese estado desde el que tiene, se saltea. Al terminar se informa cuántas cambiaron, cuántas ya estaban así y cuántas no se pudieron cambiar, por motivo.
- Hasta **100** se hacen al confirmar. Más, y hasta **2.000**, quedan encoladas (`opportunity.bulk_requested` en la auditoría) y las procesa un job, por lotes de 100, **con los permisos de ahora de quien la pidió**. El diálogo muestra el avance; si se cierra, sigue igual. Si el usuario ya no está activo o perdió el permiso, la operación falla sin cambiar nada más.
- Cada cambio queda en el historial, la actividad y la auditoría de su oportunidad, agrupado por la operación (`correlation_id`).
- El email masivo pasa a #11.

**Reglas automáticas** (las de Mi empresa → Oportunidades). Las aplica el sistema al recibir el evento:

- **Al asignar**: cuando una oportunidad pasa a un agente (no cuando queda sin agente).
- **Al reactivar**: cuando una en "Aplica a otra inmobiliaria" vuelve a consultar o se le destaca una propiedad al contacto (§3.3.10).
- **Para propietarios**: cuando nace la oportunidad de un contacto propietario.
- Mueven al estado configurado solo si el dominio lo permite y la oportunidad está abierta; si no, no hacen nada. Cada evento aplica una sola vez, aunque llegue repetido. El cambio queda como hecho por el sistema.

**Derivadas a socias**: se ven con la tarjeta del estado o el filtro de categoría "Aplica a otra inmobiliaria" (no hay una vista aparte). Cada fila muestra a qué socia se derivó, la fecha y el resultado (derivada, sin opciones, volvió a Norde). "Derivación…" en el menú los carga; solo mientras la oportunidad está en esa categoría, y queda auditado (`opportunity.referral_updated`).

### 3.3.9 Bandeja de consultas (#10)

Las **consultas** son los mensajes que llegan de los portales y del formulario de la web. Entran **pendientes** a una bandeja y terminan asignadas a un contacto (existente o nuevo) o en "Borradas". Las del agente de IA (WhatsApp, web chat) no pasan por la bandeja: ya entran por `RegisterContact`.

#10 se construye en cuatro etapas:

1. Ingesta idempotente, bandeja y contador del menú.
2. Deduplicación y asignación manual: coincidencias por teléfono o email, "Asignar a este cliente" o "Crear cliente nuevo", la oportunidad, el aviso al agente y las reglas de estado.
3. Reparto ponderado y reglas de asignación automática. Construidas pero **en pausa** (#48): Norde no usa reglas en Tokko y asigna las consultas a mano.
4. Horario laboral y política fuera de horario. **No se construyó**: solo tiene sentido con reglas. Pasó a #48.

**Ingesta** (`ReceiveInquiry`):

- La ejecutan solo los procesos que reciben consultas (`system:web`, `system:portal-sync`, `system:agent-ia`), con `inquiries:receive`.
- Es **idempotente por canal e ID externo**. Si la misma consulta llega dos veces (un reintento del portal, un doble envío del formulario), se devuelve la que ya estaba y no se escribe nada. También vale con dos entregas simultáneas: el índice único `(channel, external_id)` deja entrar una sola.
- Pide teléfono o email: sin ninguno no hay a quién responder ni con qué deduplicar. El teléfono se normaliza a E.164. Una fecha de recepción futura se toma como ahora.
- **Sucursal**: la de la propiedad consultada, que es la de su captador, hasta que la consulta se asigna. Sin propiedad, queda sin sucursal.
- **Etiquetas automáticas**: el canal y, de la propiedad consultada, sus operaciones, el tipo y el barrio. Se guardan como códigos (`channel:zonaprop`, `operation:sale`, `type:apartment`, `neighborhood:Palermo`) y la bandeja los muestra en palabras.
- Emite `clients.inquiry_received`, que van a tomar el reparto automático y los avisos.
- Se audita como `inquiry.received` **sin los datos del remitente** (canal, ID externo, fecha, propiedad, sucursal, estado y etiquetas). Mientras no se asigna, la consulta no tiene un contacto con el que suprimirlos.

**Formulario de la web** → `POST /api/webhooks/inquiries/web` en `apps/gestion` (ADR 0021):

- **Body**: JSON con `externalId` (un UUID que la web genera por envío; si reintenta, manda el mismo), `name`, `email`, `phone`, `message` y `propertyId`. Hasta 16 KB.
- **Firma**: header `x-norde-signature: sha256=<HMAC-SHA256 del body crudo>`, con el secreto compartido `INQUIRY_WEBHOOK_SECRET`. Sin esa variable el webhook no se expone.
- **Rate limit**, en memoria del proceso:
  - Por IP, solo los pedidos rechazados (firma inválida o body de más de 16 KB): `INQUIRY_WEBHOOK_RATE_PER_MINUTE` por minuto (60 por defecto). Al llegar, ese IP recibe 429 sin que se lea el body.
  - Las consultas bien firmadas no gastan ese cupo: todas llegan desde el servidor de la web (el mismo IP), y el límite por visitante va en `apps/web`. Tienen un tope total de `INQUIRY_WEBHOOK_SIGNED_RATE_PER_MINUTE` por minuto (600 por defecto), que solo corta un bucle o un secreto filtrado.
- **Respuestas**:
  - 201 si la consulta es nueva, 200 si era un reintento (`{ inquiryId, duplicate }`).
  - 400 si el body no valida.
  - 401 si la firma no es válida.
  - 413 si el body es demasiado grande.
  - 422 si el caso de uso la rechaza (sin teléfono ni email, teléfono o email inválido).
  - 429 si se pasa del límite.
- Se procesa en el momento, no en segundo plano: guardar la consulta es una inserción y la web necesita saber si entró.
- Los conectores de portales (#14) llaman al mismo caso de uso con `system:portal-sync`. Zonaprop ya lo hace (ADR 0029).

**Bandeja** (`/consultas`):

- **Quién**: la ve quien tiene "Ver consultas" (`inquiries:read`): todas las consultas, no solo las suyas. Asignar, borrar y restaurar piden "Administrar consultas" (`inquiries:manage`).
- **Pestañas**: Pendientes, Asignadas y Borradas, paginadas en el servidor. La más nueva va primero. Son tarjetas arriba de la bandeja con el total de cada una según los filtros aplicados (canal, propiedad, sucursal y fechas); tocar una cambia de pestaña (`?tab=`).
- **Filtros**: canal, propiedad (selector paginado de la cartera), sucursal y fecha de recepción (un rango con calendario; días de Buenos Aires, inclusive). En pantallas anchas van todos en una fila, con "Limpiar"; en las angostas, sucursal y fecha quedan en "Más filtros".
- **Cada tarjeta** pone la propiedad al frente:
  - a la izquierda, la foto de portada con el código (link a la ficha), a la altura de la tarjeta;
  - el título, la operación con su precio y, si los hay, el captador y la sucursal;
  - debajo, el remitente (iniciales, nombre, canal y antigüedad), el email, el celular con acceso a WhatsApp, el mensaje y las etiquetas;
  - las acciones a la derecha (abajo, en mobile).
  - En Asignadas suma el agente y el link al contacto; en Borradas, quién la borró y cuándo.
- **Borrar** la manda a Borradas (`inquiry.deleted`). **Restaurar** la devuelve a pendiente, o a asignada si ya tenía contacto (`inquiry.restored`).
- **Menú**: "Consultas" muestra cuántas hay sin asignar (pendientes, sin las borradas) a quien puede verlas.

**Asignación** (`AssignInquiry`, botón "Asignar" de las pendientes):

- **Coincidencias** (`ListInquiryMatches`): los contactos que comparten el teléfono o el email de la consulta, en cualquiera de los suyos, también los de otros agentes y los de la papelera. Paginadas en el servidor: primero los que coinciden por teléfono, después los activos. Cada una muestra el nombre, el agente, el alta, el último contacto y si coincide por teléfono, por email o por los dos. La ficha se puede abrir solo si el actor puede ver ese contacto.
- **"Asignar a este cliente"**: solo a uno de los que coinciden. Si estaba en la papelera, vuelve a la agenda.
- **"Crear cliente nuevo"**: solo si no coincide ninguno. Es la misma regla del alta manual: no se crean dos contactos con el mismo teléfono o email.
- **Contacto**: se registra con la misma regla que `RegisterContact`. Se suma el canal de la consulta (identificado por el email o, sin él, el teléfono) y se completan los datos que faltan, sin pisar los que tiene. Un teléfono o un email que ya usa **otro** cliente no se le suma (no se le saca a ese cliente): si son la misma persona, se unifican desde el panel.
- **Oportunidad**: se abre una por la propiedad consultada, con el mensaje como nota (hasta 2.000 caracteres), o se suma el pedido a la abierta por lo mismo. Nace en el estado de la regla "al crear".
- **Tipo**: se propone alquiler si la propiedad solo se alquila (también temporario) y compra en el resto de los casos, también sin propiedad. Quien asigna lo puede cambiar.
- **Agente a cargo**: se elige en el diálogo (con `users:read`). Sin elegir, queda el de la oportunidad (el del contacto) o, si nadie la tiene, quien asigna.
  - Si el elegido es otro, la oportunidad se reasigna y corre la regla "al asignar". Por eso un contacto nuevo nace sin agente y pasa al elegido.
  - Un contacto sin agente queda también a su cargo. El agente de un contacto que ya tiene uno no cambia.
  - La consulta pasa a la sucursal del agente; sin agente, conserva la de la propiedad.
- **Aviso al agente y actividad**: los mismos que con cualquier oportunidad nueva o que vuelve a consultar. Los disparan `clients.opportunity_created` y `clients.opportunity_request_added`.
- **Una sola vez**: la fila se bloquea mientras se asigna. Dos asignaciones a la vez, o la misma dos veces, dejan un solo contacto y una sola oportunidad; la segunda recibe "La consulta ya estaba asignada".
- Se audita como `inquiry.assigned` (estado, contacto, oportunidad, agente y sucursal) con el ID del contacto, además de la auditoría del contacto y de la oportunidad. Emite `clients.inquiry_assigned`.
- **Supresión de datos**: al suprimir un contacto se borran también las consultas sin asignar que tienen alguno de sus teléfonos o emails. Las asignadas a él caen con el contacto.

**Reglas de asignación automática** (`/consultas/reglas`, con "Administrar consultas"):

> **En pausa (#48).** Se prenden con `INQUIRY_RULES_ENABLED=true` en `apps/gestion`: muestra la pantalla y su link, y `RouteInquiry` usa las reglas. Apagadas, `/consultas/reglas` responde 404 y una consulta queda pendiente hasta que se asigna a mano, salvo que su emprendimiento derive por chances (§4.1, Emprendimientos).

- **Regla**: nombre, condiciones y agentes con su peso (de 1 a 10). Hasta 100 reglas y 20 agentes por regla.
- **Condiciones**: canal, operación de la propiedad, tipo de propiedad, zona (barrios), propiedad y emprendimiento.
  - Una condición vacía es "cualquiera"; sin ninguna, la regla toma cualquier consulta.
  - Con varias, la consulta tiene que cumplir todas. Dentro de cada una alcanza con un valor.
  - Se comparan con las etiquetas automáticas de la consulta y sus IDs. La zona, sin mayúsculas ni acentos.
  - Emprendimiento ya está en el modelo, pero el asistente no ofrece un selector: para repartir las consultas de un emprendimiento se usa su derivación por chances (§4.1). Una consulta por una unidad cuenta como consulta por su emprendimiento.
- **Prioridad**: cada consulta va a la **primera regla activa que cumple**, en orden. Se sube o baja de a un lugar dentro de su pestaña.
- **Activas e inactivas**: una inactiva no toma consultas, pero conserva su lugar y su reparto.
- **Asistente por pasos**: nombre, condiciones, agentes con su peso (con el % que recibe cada uno) y revisión.
- **Reparto ponderado**: un round robin "suave" y determinístico.
  - En cada vuelta de "suma de pesos" consultas, cada agente recibe tantas como su peso, intercaladas. Con A en 2 y B en 1: A, B, A, A, B, A…
  - La regla guarda cuántas repartió (`cursor`), y la fila se bloquea al tomar el turno: dos consultas a la vez no reciben el mismo.
  - Los agentes inactivos se saltean. Si cambian los agentes o sus pesos, el reparto arranca de cero.
- **Al entrar una consulta** (`RouteInquiry`, reacción a `clients.inquiry_received` en `apps/gestion`, como `system:scheduler`):
  - Primero, la **derivación por chances** de su emprendimiento (o el de la unidad consultada), si tiene agentes; funciona con las reglas apagadas. Si ninguno de sus agentes está activo, sigue con las reglas.
  - Se asigna como con "Asignar", sin una persona: al contacto que coincide por teléfono o email o, si no hay ninguno, a uno nuevo.
  - **Si el contacto ya tiene agente**, la oportunidad sigue con él y la regla no avanza su reparto. Si no, va al agente que toca.
  - **Queda pendiente** si no cumple ninguna regla, si coinciden varios contactos distintos (decide una persona) o si la regla no tiene ningún agente activo.
  - Es idempotente: una consulta que ya no está pendiente no se toca.
  - La auditoría de `inquiry.assigned` suma la regla (`ruleId`) o el emprendimiento (`developmentChances`) que la repartió.
- **Auditoría** de las reglas: `inquiry_rule.created`, `.updated` (con el diff), `.activated`, `.deactivated`, `.moved` y `.deleted` (con todos sus valores).

**Diferencias con Tokko**:

- Las consultas de visitas sin contacto no existen: Calendario está fuera de alcance.
- La bandeja no muestra las conversaciones del agente de IA, que ya son contactos. Que el agente mande a la bandeja lo que no pudo registrar queda para otra issue.
- Las grillas son paginadas en el servidor, también las coincidencias.
- "Crear cliente nuevo" no está disponible si el teléfono o el email ya son de un contacto.
- Cliente y oportunidad están separados: asignar una consulta abre o actualiza una oportunidad del contacto.
- No se conocen las reglas que Norde usa en Tokko: el asistente es genérico y arranca sin reglas.
- El reparto automático respeta al agente que ya tiene el contacto.

### 3.3.10 Destacadas y búsquedas guardadas (#11, etapa 1)

#11 (seguimiento comercial) va en cuatro etapas: (1) destacadas y búsquedas guardadas, (2) envíos por email o WhatsApp con link público, reacciones y las reglas "tras enviar" y "tras me gusta / no me gusta", (3) respuestas rápidas, (4) cruce con el stock, seguimientos automáticos y baja.

**Destacar** una propiedad a un contacto, desde cuatro lugares:

- La pestaña **Ofrecer** de su ficha.
- El **buscador** de propiedades: la acción de la fila o la acción masiva sobre las marcadas (hasta 50; no sobre "todas las que cumplen los filtros").
- **Más acciones** de la ficha de la propiedad.
- Sus **potenciales interesados** (pestaña Contactos de la ficha), con el contacto ya elegido.

Cada destacada guarda:

- **Coincidencia** (0 a 100 %) con la mejor búsqueda guardada del contacto al destacarla. Es la proporción de los criterios que la búsqueda define y la propiedad cumple: operación (si no la tiene, 0 %), tipos, ubicaciones (o una debajo), ambientes mínimos y precio (a consultar u otra moneda no cumple). Todos valen lo mismo y 100 % es coincidir en todo. Sin búsquedas, "Sin búsqueda". No se recalcula después.
- La **oportunidad abierta más reciente** del contacto. Si tiene una, se publica `clients.opportunity_listings_featured` y la regla "al reactivar" puede sacarla de "Aplica a otra inmobiliaria".
- **Auto-envío de novedades** (switch por destacada): queda guardado y auditado; los envíos llegan con la etapa 4.

Por fila: ver la ficha de la propiedad, reservarla (si está disponible y hay `reservations:create`, con el contacto ya elegido y la oportunidad de la destacada; ver §4.9) y quitar la destacada. Marcando varias, **Enviar** las manda juntas (hasta 20).

**Envíos** (#104, etapa 1; ADR 0048). Quien puede editar el contacto le manda una o varias destacadas:

- **Por email**: con la plantilla de Norde (Resend), el mensaje del asesor, una tarjeta por propiedad y el botón al link. Si el email no sale, el envío no queda registrado.
- **Por WhatsApp**: el panel abre el WhatsApp del asesor (`wa.me`) con el mensaje y el link escritos; el asesor lo manda desde ahí. No pasa por el agente de IA.
- Se elige el email o el teléfono entre los del contacto. Solo van propiedades que se ven en el sitio.
- Cada envío es un **link público** `<sitio>/e/<token>`: el token es al azar, se guarda hasheado, no lleva IDs ni datos del cliente, **vence a los 90 días** y se puede **revocar**. La página muestra las propiedades, el nombre del asesor y los botones "me gusta" / "no me gusta"; no se indexa.
- La **apertura** la registra el navegador (la vista previa de WhatsApp o del correo no cuenta). La primera queda en la actividad y en el historial; las siguientes suman al contador.
- Cada **reacción** (se puede cambiar de opinión) queda en la actividad, el historial y la columna Reacción de la destacada, y dispara su regla.
- El envío queda atado a la **oportunidad abierta más reciente** del contacto: es la que mueven las reglas "tras enviar" y "tras me gusta / no me gusta".
- Pestaña **Envíos** de la ficha: cada envío con su canal, quién lo mandó, las propiedades (con lo que le pareció cada una), si lo abrió y si el link sigue vigente. Paginada en el servidor.

Pendiente de #104: compartir desde la ficha de la propiedad y la vista rápida del emprendimiento (etapa 2) y el email masivo desde Oportunidades (etapa 3).

**Respuestas rápidas** (#105). Plantillas para el mensaje de los envíos, en **Mi empresa → General → Respuestas rápidas**:

- Cada una tiene nombre, asunto (opcional, solo para el email) y mensaje (hasta 1.000 caracteres, lo mismo que el mensaje de un envío).
- **Variables**: `[[nombre_contacto]]`, `[[primer_nombre_contacto]]`, `[[nombre_asesor]]` (quien envía) y `[[nombre_empresa]]`. Se completan al enviar, por email y por WhatsApp. Una variable que no existe no se puede guardar en la plantilla; si el asesor la escribe a mano en el envío, queda como está.
- Grilla paginada en el servidor, por nombre, con búsqueda y pestañas Activas / Inactivas. Alta y edición en un panel lateral.
- Las **inactivas** no se ofrecen al enviar. **Borrar** es físico: queda en la auditoría con todos sus valores, y los envíos que la usaron no cambian (el mensaje se copió al enviarlo).
- Al **enviar**, el asesor elige una (selector paginado con búsqueda, solo las activas): el asunto y el mensaje se completan y los puede ajustar antes de mandar.
- Permisos: administrarlas pide `quick-replies:manage` (Gerencia en Tokko); elegirlas al enviar, poder editar algún contacto (lo mismo que enviar).
- Auditoría con `entity_type = 'quick_reply'`: `quick_reply.created`, `.updated` (solo lo que cambió), `.activated`, `.deactivated` y `.deleted`.

**Diferencias con Tokko**: las reglas de automatización de las respuestas rápidas (por ejemplo, mandar una antes de asignar el agente) no se construyeron: falta confirmar si Norde las usa. La columna `automation` queda en `null`.

**Búsquedas guardadas** (pestaña Búsquedas, en un panel lateral sobre la grilla):

- Nombre (opcional), operación, tipos, ubicaciones del catálogo, moneda con precio desde y hasta, ambientes mínimos y envío automático. Se puede atar a la oportunidad abierta del contacto.
- Borrar las manda a la papelera ("Vigentes / Papelera"); se restauran desde ahí.
- Como mucho 20 vigentes por contacto. Si el contacto se dio de baja de los envíos, el asesor no le vuelve a activar el envío automático. Prender el envío automático pide el permiso de seguimientos automáticos (§3.4).
- Desde el **buscador**, "Guardar para un contacto" arranca con sus filtros (operación, tipo, moneda y precios). La ubicación del buscador es texto libre: no se copia y se pide elegirla del catálogo.
- Auditoría contra el contacto: `client.saved_search_created`, `.saved_search_updated` (solo lo que cambió), `.saved_search_deleted` y `.saved_search_restored`. Destacar suma la oportunidad a `client.listings_featured`; el switch registra `client.featured_auto_send_changed`.

**Diferencias con Tokko**: la coincidencia es una foto del momento de destacar, con una regla explícita. Las búsquedas tienen papelera y tope por contacto.

### 3.4 Cruce de búsquedas con stock (seguimientos automáticos, #106)

Da soporte a las "Oportunidades por mail" del módulo 2. Se construye en dos etapas: (1) el cruce y el permiso, (2) el resumen diario por email y la baja del cliente.

**Cruce** (etapa 1). Un job escucha los cambios de las propiedades y anota lo que hay que mandarle a cada contacto:

- Solo cuenta una propiedad que el sitio muestra (**disponible y publicada en la web**): el envío lleva un link que el cliente tiene que poder abrir.
- **Propiedad nueva**: coincide (§3.3, `matchesSavedSearch`) con una búsqueda con envío automático **guardada antes** de que la propiedad empezara a ofrecerse (pasó a disponible). Lo que ya estaba en el stock no es novedad. Si se publica en la web después de pasar a disponible, cuenta desde que pasó a disponible.
- **Baja de precio**: el precio nuevo de una operación es menor que el anterior, en la misma moneda (un cambio de moneda, una suba o pasar a "a consultar" no se avisan). Coincide con las búsquedas con envío automático de esa operación y con las **destacadas con auto-envío de novedades** de esa propiedad.
- Solo búsquedas vigentes y sin baja del cliente, y destacadas vigentes, de contactos que no están en la papelera.
- **Idempotente**: una propiedad entra una sola vez como nueva por contacto (aunque coincida con dos búsquedas) y cada baja una vez por precio; si vuelve a bajar, es otra baja.
- Cada coincidencia queda en el historial del contacto como cambio del sistema (`client.follow_up_matched`, con la propiedad, el motivo, la búsqueda o destacada y el precio). Unificar contactos las pasa al principal sin repetir; la supresión las borra.

**Permiso "Activar seguimientos automáticos"** (`followups:automatic`, Gerencia → Seguimientos; Administración y Gerencia lo tienen): prender el envío automático de una búsqueda o el auto-envío de novedades de una destacada lo pide. Sin él, el switch se ve apagado y bloqueado; uno que ya está prendido se puede apagar y la búsqueda se puede editar.

**Resumen diario** (etapa 2). Todos los días a las 10 (hora de Buenos Aires) sale un email por contacto con lo que el cruce encontró desde el último:

- Es un envío como los del asesor (§3.3.10): link `/e/<token>` que vence, con aperturas y "me gusta". Queda en la actividad y en los envíos del contacto como "Seguimiento automático", y en su historial (`client.follow_ups_sent`). No se ata a una oportunidad: no mueve el embudo, porque no es el asesor el que contacta.
- Va al email principal del contacto, firmado por su agente (o por Norde si no tiene). Una propiedad que es nueva y además bajó de precio va una sola vez.
- Entran hasta 20 propiedades (lo que entra en un envío), las más viejas primero; las demás salen al día siguiente.
- El asunto y el mensaje son fijos según haya propiedades nuevas, bajas de precio o las dos: no hay plantilla para editar (no hay pantalla de configuración, 2026-10-27).
- Antes de mandar se descarta lo que ya no corresponde (`client.follow_ups_discarded`): la búsqueda se borró, se apagó su envío automático o el cliente se dio de baja; la destacada se quitó o se le apagó el auto-envío; la propiedad dejó de verse en el sitio; el contacto está en la papelera o no tiene email.
- Si el email no sale, no queda nada y se reintenta al día siguiente.

**Baja del cliente** (etapa 2). Cada email automático tiene al pie un link a `/e/<token>/baja`. La página pide confirmar con un botón (los lectores de correo abren los links para revisarlos). Al confirmar, todas las búsquedas del contacto quedan dadas de baja (el asesor no puede volver a prender su envío automático) y se apaga el auto-envío de sus destacadas. Queda en su historial (`client.follow_ups_unsubscribed`). Sirve aunque el link del envío haya vencido.

**Diferencias con §3.4 original**: a las búsquedas sin envío automático no se le avisa al asesor (Norde no lo pidió, 2026-10-27).

### 3.5 Exportar a Excel

- Exporta el listado con los filtros aplicados a `.xlsx`.
- Requiere un permiso específico y queda registrado en la auditoría.

---

## 4. Propiedades: Venta, Alquiler y Emprendimientos

Las tres comparten el mismo modelo base, con campos específicos según la operación.

### 4.1 Alta, baja y modificación

Campos comunes:

- **Identificación**: código interno, título, descripción, operación (venta / alquiler / alquiler temporario).
- **Tipo**: departamento, casa, PH, terreno, local, oficina, cochera, galpón, depósito. Galpón y depósito son tipos distintos porque Zonaprop los publica en tipos distintos (Bodega-Galpón y Depósito); MercadoLibre los publica en la misma categoría.
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

**Emprendimientos** (desarrollos en pozo o en construcción, #7):

- Cada unidad es una **propiedad con `developmentId`**: tiene su tipología, piso, superficie, precio y estado, y reutiliza el buscador, la ficha, la web y los portales. No hay un modelo aparte de unidad.
- **Listado** (`/emprendimientos`, con `developments:read`): grilla paginada en el servidor con código, nombre, tipo, dirección para publicar, estado, estado de obra, fecha de entrega, unidades activas, etiquetas y página web. Búsqueda por código, nombre, dirección o desarrollista; filtros por estado, tipo y estado de obra; orden por actualización, nombre, código o entrega. Papelera con restaurar (`developments:delete`).
  - **Vista rápida** (el ojo de cada fila): fotos, estado, estado de obra, unidades y disponibles, servicios y amenities, favorito, "Descargar unidades" (el Excel de unidades) y accesos a la ficha, a sus unidades, a sus archivos y a su página web.
  - **Mapa** (`?layout=map`): los emprendimientos activos con coordenadas del área visible, con los mismos filtros, una capa por estado y como mucho 500 pines (los actualizados más recientemente). El globo enlaza a la ficha.
- **Estados**: "Cargando información" (al crear) y "Comercializando". Se pasa de uno a otro a mano. Solo los que están en "Comercializando" se publican en el sitio (`/emprendimientos`), con sus unidades disponibles y publicadas en la web; ver el módulo 2, sección 7.
- **Alta** en panel lateral (`developments:create`): nombre público, tipo de desarrollo, dirección privada, ubicación del catálogo (obligatoria: las unidades la heredan), coordenadas, dirección para publicar y título para portales (si quedan vacíos, se arman solos), desarrollista y contacto comercial (privados). El código sale de la numeración de Mi empresa. Sin coordenadas, se buscan con la dirección.
- **Ficha** (`/emprendimientos/[id]`), con pestañas:
  - **Detalles**: datos generales, ubicación (con mapa), obra, entrega y financiación (financiado, acepta permuta, escritura inmediata, formas de pago, descripción), servicios y adicionales del catálogo, y etiquetas. Cada sección se edita en el lugar.
  - **Unidades**: el buscador de propiedades filtrado por el emprendimiento, paginado. "Nueva unidad" crea una propiedad en borrador que hereda la dirección privada y la de publicar, la ubicación, las coordenadas, los servicios y adicionales, el captador y la sucursal del emprendimiento; se cargan tipo, ambientes, piso, unidad, superficies, operación y precio. La ficha de la unidad enlaza a su emprendimiento.
  - **Multimedia**: fotos y planos (con orden y portada), videos y recorridos 360, igual que en la ficha de propiedad (§4.8), con las mismas variantes generadas por un job.
  - **Archivos**: documentos del emprendimiento (brochure, reglamento, planos en PDF), con descarga autorizada por el panel.
  - **Derivación**: los agentes que reciben las consultas del emprendimiento, con su peso (ver abajo).
  - **Historial**: la "Actividad" de Tokko (quién cambió qué y cuándo), con filtro por datos, estado, unidades, multimedia y archivos, y etiquetas y derivación.
- **Excel de unidades** (`/emprendimientos/[id]/importaciones`, desde la pestaña Unidades):
  - **Exportar** ("Exportar a Excel" o "Descargar unidades"): las unidades activas con código, piso, unidad, tipo, ambientes, superficies, moneda y precio de cada operación y estado. Al final van columnas solo para leer, como en la planilla de Tokko (dormitorios, baños, toilettes, cocheras, superficie semicubierta, terreno, frente, fondo, expensas y dirección para publicar): la importación no las reconoce, así que el archivo se vuelve a subir tal cual. Unidades son propiedades: hasta 10 alcanza con `properties:export`; más, con `properties:export-bulk`. Se arma por lotes y queda en el historial del emprendimiento (`development.units_exported`, con la cantidad).
  - **Importar** (crear propiedades y editar el emprendimiento): se sube un `.xlsx` (hasta 5 MB y 2.000 filas), la vista previa propone qué columna va con cada dato (reconoce los encabezados de la exportación y los habituales de una lista de precios: "Depto", "Precio", "Moneda") y se puede corregir. La importación corre como job (`properties.unit_import_requested`) y la pantalla muestra el avance.
  - **Clave**: el piso y la unidad dentro del emprendimiento, sin mayúsculas, acentos, espacios, puntos ni "°" ("4° A" = "4A"). Si existe una unidad así, se actualiza; si no, se crea heredando lo del emprendimiento, como "Nueva unidad", con el código de la numeración. Importar dos veces el mismo archivo no duplica unidades.
  - **Qué cambia**: ambientes, superficies, moneda y precio de cada operación (una operación que la unidad no tenía se suma) y estado. Las celdas vacías no borran nada; "Consultar" deja la operación sin precio. El tipo se usa solo al crear. Pasar a "Disponible" respeta `properties:mark-available` de quien importó, y "Reservada" no se elige (la marca una reserva).
  - **Filas con problemas** (no frenan la importación): sin unidad, dos unidades con el mismo piso y unidad, unidad en la papelera, unidad nueva sin tipo o sin operación, operación nueva sin moneda, valor inválido, estado no permitido o sin código de referencia. El reporte muestra la fila, el dato y enlaza a la unidad si existe.
  - **Historial**: la importación queda en el del emprendimiento (`development.units_import_requested`, `development.units_imported` o `development.units_import_failed`, con los totales), y cada unidad creada o actualizada en el suyo como `system:import`, agrupada por la importación. El archivo se borra al terminar.
- **Derivación por chances** (pestaña Derivación; la edita quien puede editar el emprendimiento):
  - Hasta 20 agentes activos, cada uno con un peso de 1 a 10 y el % de consultas que le toca. Sin agentes, no deriva.
  - Toma las consultas por el emprendimiento y por cualquiera de sus unidades, antes que las reglas de asignación y aunque estén apagadas (`INQUIRY_RULES_ENABLED`).
  - El reparto es el mismo round robin ponderado de las reglas: con A en 2 y B en 1, A, B, A, A, B, A… El emprendimiento guarda cuántas derivó (`inquiry_route_cursor`) y se bloquea al tomar el turno.
  - Si quien consulta ya tiene agente, la consulta va a él y el reparto no avanza. Los agentes inactivos se saltean; si ninguno está activo, la consulta sigue con las reglas o queda pendiente.
  - Cambiar los agentes, sus pesos o su orden reinicia el reparto y queda en el historial (`development.chances_updated`, con los agentes y pesos antes y después). Un emprendimiento en la papelera no deriva.
- **Fotos en las unidades**: el PDF de una unidad suma, después de las suyas, las fotos del emprendimiento marcadas para el PDF, si "Fotos del emprendimiento en las unidades" está activo en Mi empresa. Se leen del emprendimiento; no se copian.
- **Favoritos**: la estrella de la ficha y de la vista rápida marca el emprendimiento como favorito de quien usa el panel.
- **Permisos**: editar los propios (`developments:update`), los de su sucursal (`developments:update-branch`) o todos (`developments:update-all`), según el captador y su sucursal. Sumar unidades pide además `properties:create`.
- **Borrar**: un emprendimiento con unidades activas no se puede borrar; primero se borran las unidades.
- Auditoría: `development.created`, `development.updated`, `development.status_changed`, `development.tags_changed`, `development.chances_updated`, `development.deleted`, `development.restored`, `development.unit_added` (contra el emprendimiento, con el ID de la unidad) y las del Excel de unidades. El contacto comercial va en `client_ids`. La multimedia y los archivos se registran como en la propiedad (`development.media_added`, `development.cover_changed`, `development.attachment_added`, etc.).
- La galería y los archivos son los mismos casos de uso que en la propiedad, con un **dueño** (propiedad o emprendimiento) que decide los permisos, la papelera y el historial.
- **Pendiente de #7**: "Compartir" llega con #11 y "Difusión" con #14.

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

| Portal           | Qué se busca                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **MercadoLibre** | API oficial (OAuth). Publicar, actualizar y pausar avisos de inmuebles, y traer las **preguntas y consultas** como clientes   |
| **Zonaprop**     | API de Open Navent (Norde es integrador): publicar el stock, vincular los avisos de Tokko y traer las consultas por callbacks |
| **Argenprop**    | Igual que Zonaprop: confirmar si hay API o feed XML para inmobiliarias                                                        |

Diseño propuesto:

- Un **conector por portal** con la misma interfaz: `publish`, `update`, `pause`, `unpublish` y `fetchLeads`.
- Una tabla `portal_listings` guarda la relación entre la propiedad, el portal, el ID externo, el estado y el último error.
- La sincronización es **asíncrona**, con una cola de trabajos y reintentos. Los errores se ven en el panel.
- Las consultas que llegan de los portales entran como **oportunidades con canal = portal**, unificadas con el cliente si ya existía (ver 3.3). Esto alimenta los reportes de orígenes.

> Riesgo: el acceso a las APIs de Zonaprop y Argenprop suele requerir un acuerdo comercial o ser partner. Conviene confirmarlo temprano; si no hay acceso, la alternativa es exportar un feed o cargar a mano.

**MercadoLibre primero (#14)**: alta, edición y baja de propiedades y emprendimientos replicadas en ML, y sus consultas en la bandeja. Zonaprop llegó después; el listado por portal está en #114 (abajo). Argenprop, el carrusel y las redes quedan para después. Se construye en cuatro etapas, detrás de `PORTALS_ENABLED` (apagado por defecto). Decisiones técnicas en el ADR 0022.

1. **Cuentas** (hecha):
   - Mi empresa → Portales muestra dos tarjetas: **MercadoLibre · Propiedades** y **MercadoLibre · Emprendimientos**.
   - Son dos cuentas de ML porque la de emprendimientos, con su paquete, no puede publicar avisos comunes. Una misma cuenta de ML no se conecta en las dos.
   - Cada tarjeta permite conectar, reconectar y desconectar por OAuth, y activar o desactivar la cuenta. Solo una cuenta conectada se activa, y desconectar la desactiva y borra sus credenciales, pero no toca los avisos que ya están en ML.
   - Las acciones piden `portals:manage`. Ver las cuentas pide eso o `portals:publish`.
   - **Diseño de la pantalla**: una tarjeta a lo ancho por cuenta, con el logo del portal a la izquierda. Sin conectar, la tarjeta propone conectarla. Conectada, muestra la cuenta, cuántas propiedades (o emprendimientos) del sistema están vinculadas a ese portal (con aviso publicado, pausado o con error) y el plan: los créditos (Zonaprop) o los paquetes (MercadoLibre).
   - Lo que se gestiona va en un **panel lateral** ("Gestionar conexión", `?panel=<portal>`): repite los datos de la tarjeta y suma activar, cambiar el código o reconectar, recibir las consultas al instante, vincular avisos y desconectar. Sin `portals:manage`, el panel es de solo lectura ("Ver detalle").
   - Auditoría: `portal_account.connected` y `portal_account.disconnected` (con la cuenta de ML antes y después), y `portal_account.enabled` y `portal_account.disabled`.
2. **Publicar propiedades** (hecha). Decisiones técnicas en los ADR 0024 y 0031.
   - **Pestaña Difusión** de la ficha, con `portals:publish` o `portals:manage` y la función prendida:
     - Una fila por operación de la propiedad (venta, alquiler) en cada cuenta activa.
     - Cada fila muestra el estado (Publicando…, Publicada, Pausada, Con error, Dada de baja), el tipo (simple o destacado), el último error, la última sincronización y "Ver en MercadoLibre".
     - Acciones: **Publicar** (eligiendo simple o destacado), **Pausar** y **Reactivar**, **Pasar a destacado/simple**, **Sincronizar** y **Dar de baja** (con confirmación).
     - Mientras un aviso se publica, la pestaña se refresca sola.
   - **Un aviso por operación**: venta y alquiler son dos avisos (son categorías distintas de ML, y cada uno consume cupo).
   - **Antes de publicar** se revisa:
     - Que la cuenta esté conectada y activa.
     - Que la propiedad esté disponible y la operación tenga precio (sin precio o con "a consultar", no se publica).
     - Que tenga al menos una foto lista y marcada "Mostrar en la web".
     - Que la propiedad tenga sucursal y que esa sucursal tenga WhatsApp de Argentina (+54: ML no toma otros). La propiedad toma la sucursal de su captador al crearse o al cambiar el captador; si no tiene, se pide volver a elegir el captador.
     - Que tenga los datos que ML exige por tipo: superficie total y cubierta, ambientes, dormitorios y baños. Las cocheras vacías van como 0.
     - Si falta algo, se dice qué.
   - **Fuera de esta etapa:**
     - Las unidades de un emprendimiento se publican con su emprendimiento (etapa 4).
     - El alquiler temporario todavía no se publica: ML pide huéspedes, horarios y estadía mínima, que no cargamos.
   - **Sincronización.** El aviso lo crea un job, y después los cambios de la ficha y de sus fotos llegan solos (si lo que se manda no cambió, no se llama a ML). También los cambios del contacto de la sucursal, del pie de la descripción para portales y de la URL de la ficha en la web: se pide sincronizar todo lo publicado. Según el estado de la propiedad:
     - Reservada o pausada → aviso pausado. Vuelve a disponible → se reactiva.
     - Vendida, alquilada, retirada, borrador o en la papelera → aviso cerrado. Cerrar es definitivo en ML: volver a mostrarlo es "Volver a publicar", un aviso nuevo.
     - Si el aviso ya está publicado y el contenido nuevo no se puede mandar (se sacó la operación, el precio pasó a "a consultar", falta un dato), el aviso **se pausa** con el motivo, para que ML no siga mostrando el precio viejo. Cuando se corrige, se manda y se reactiva.
     - Si ML está revisando el aviso, lo inactivó, espera un pago o lo pausó por moderación, no se intenta activarlo: queda pausado con el motivo hasta que se resuelva en ML.
     - El tipo se compara como simple o destacado: un aviso vinculado de Tokko en Oro u Oro Especial ya es destacado y no se pasa a Oro Premium.
     - Cada aviso nuevo lleva el ID de la publicación en el campo del vendedor. Si el alta se corta después de que ML creó el ítem, el reintento lo encuentra por ese campo y no publica otro.
   - **Errores.**
     - Si ML rechaza el aviso, el motivo queda en la fila, con el status de ML. Si ML no lo explica, se dice qué significa el status (402: la cuenta no tiene paquete de inmuebles con cupo; 403: no tiene permiso para publicar inmuebles).
     - Si ML no responde, se reintenta solo durante unos 15 minutos. Lo que siga en error por eso se vuelve a pedir en la conciliación diaria.
     - Si ML rechaza las credenciales de la cuenta, la fila pide reconectarla y la tarjeta de Mi empresa → Portales muestra "Pide reconectar". Al reconectar, se vuelve a pedir lo que falló por credenciales.
     - Con avisos publicados, solo se puede volver a conectar **el mismo usuario de ML** (también después de desconectar): con otro, los avisos quedarían apuntando a otro vendedor.
   - **Qué se publica:**
     - El título para portales y la descripción con el pie de Mi empresa → Portales.
     - La dirección para publicar (nunca piso ni unidad), con coordenadas y la ubicación del catálogo (resuelta contra las de ML).
     - Las fotos de la web (con marca de agua si está activa, hasta 30, portada primero).
     - El contacto de la sucursal del captador.
   - **Auditoría** contra la propiedad:
     - Lo que pide el equipo: `property.portal_publish_requested`, `property.portal_pause_requested`, `property.portal_resume_requested`, `property.portal_unpublish_requested` y `property.portal_type_changed`.
     - Lo que pasa en el portal, por `system:portal-sync`: `property.portal_published`, `property.portal_paused`, `property.portal_unpublished` y `property.portal_sync_failed` (con el motivo).
   - **Conciliación diaria (2b).** Todos los días a las 6 se lee de MercadoLibre cómo están los avisos publicados, y la fila de Difusión refleja lo que pasó allá:
     - **Vencido, borrado o dado de baja por ML**: queda "Dada de baja", con el motivo ("MercadoLibre venció el aviso: terminó su vigencia."). Volver a mostrarlo es "Volver a publicar".
     - **Pausado por moderación, por falta de pago o desde el sitio de ML**: queda "Pausada", con el motivo que da ML ("Reportada como no disponible."). No se reactiva sola: se resuelve en MercadoLibre y se toca **Sincronizar**.
     - **Reactivado en ML**: vuelve a "Publicada". Si el equipo lo había pausado, se vuelve a pausar.
     - Se audita contra la propiedad por `system:portal-sync` (`property.portal_unpublished` o `property.portal_paused`, con el motivo).
     - **Al instante** (ADR 0035): MercadoLibre avisa cada cambio de un aviso (tópico `items` de la app). El sistema lee cómo quedó ese aviso y lo refleja enseguida, con la misma regla. La corrida diaria sigue como respaldo.
   - **Estadísticas de cada aviso** (ADR 0036): en Difusión, cada aviso de MercadoLibre muestra las visitas, preguntas, vistas del teléfono y WhatsApp de los últimos 30 días, y las visitas desde que se publicó. Se leen de MercadoLibre al abrir la pestaña y se guardan 5 minutos. Si ML no responde, la fila lo dice.
   - **Cupo de los paquetes (2b).** Las tarjetas de MercadoLibre de Mi empresa → Portales muestran los paquetes activos de la cuenta: nombre, para qué sirven (publicaciones, destaques, emprendimientos), vencimiento y el cupo libre de cada tipo de aviso (Plata, Oro, Oro Premium). Se lee de MercadoLibre en el momento. Sin paquetes, la tarjeta avisa que no se puede publicar.
3. **Vincular los avisos que hoy publica Tokko** (hecha, ADR 0033), sin republicarlos: conservan su antigüedad, sus visitas y sus consultas.
   - **Mi empresa → Portales → Avisos en MercadoLibre** lista los avisos activos de la cuenta de propiedades, con su operación, y propone la propiedad que tiene el código que Tokko cargó en el aviso. Se vincula con un clic.
   - Los que no traen código, o están pausados, se vinculan **a mano desde la ficha**, en Difusión, pegando el link del aviso (Tokko lo muestra en cada propiedad).
   - **Un aviso por operación:** el aviso de venta se vincula a la venta de la propiedad y el de alquiler, al alquiler. El aviso queda simple o destacado, como estaba.
   - **Las unidades de los emprendimientos** que Tokko publicó sueltas se vinculan a la unidad, desde su ficha. Se sincronizan como cualquier propiedad. Una unidad no se publica suelta desde el sistema: va con su emprendimiento (etapa 4). Los avisos sueltos conviven con el del emprendimiento.
   - El aviso **queda como lo dejó Tokko** hasta que cambie algo de la propiedad en el sistema; desde ahí lo actualiza el sistema.
   - Antes de vincular en producción hay que apagar la publicación de Tokko en MercadoLibre.
   - **Pendiente:** confirmar con la cuenta real dónde guarda Tokko el código en el aviso (hoy se busca en el campo del vendedor y en el SKU).
4. **Emprendimientos** (hecha, ADR 0034): un aviso por emprendimiento, en la cuenta **MercadoLibre · Emprendimientos**, con las unidades como variaciones.
   - Se publica **a pedido**, desde la pestaña Difusión del emprendimiento, como en Zonaprop pero sin plan. Después se sincroniza solo: cada cambio del emprendimiento o de sus unidades actualiza el aviso, y si no queda ninguna unidad, se pausa.
   - **Qué unidades van:** las disponibles, en venta y con precio, del **tipo más común** entre departamentos, casas, oficinas y lotes (ML solo tiene emprendimientos de esos tipos, y solo en venta). Ese tipo da la categoría. Las cocheras, los locales y las unidades solo en alquiler no entran.
   - **Cada unidad** es una variante con su precio, su nombre (piso y unidad, "Piso 3 · B"; sin ellos, su código), su tipología ("2 ambientes"), sus superficies, ambientes, dormitorios, baños y cocheras, y hasta 3 fotos. Si no tiene fotos, lleva la portada del emprendimiento.
   - **Antes de publicar** se revisa:
     - Que todas las unidades del aviso tengan el precio en la misma moneda.
     - Que cada unidad tenga lo que ML exige para su tipo (se dice qué le falta a cuál).
     - Que haya una foto para cada unidad, la etapa de la obra, el WhatsApp de la sucursal y la ubicación.
   - **El tipo de aviso lo da el paquete de emprendimientos** de la cuenta; no se elige simple o destacado. ML activa ese paquete a pedido, para **un solo emprendimiento** por activación. Sin paquete con cupo, la fila lo dice.
   - **Cotizaciones:** cuando alguien pide la cotización de una unidad, entra a la bandeja como consulta ("Pidió la cotización de una unidad.") con esa unidad.
   - **Pendiente:** confirmar con la cuenta real el tipo de lead de las cotizaciones y que ML tome las fotos de las variantes por link.

**Consultas de MercadoLibre** (hecha, ADR 0032): los contactos de los avisos de las dos cuentas entran a la **bandeja de consultas** con canal MercadoLibre.

- Entran solos **cada 10 minutos**, leídos de MercadoLibre (los de los últimos 2 días; los que ya estaban no se repiten, y de esos no se vuelve a pedir el texto de la pregunta).
- **Al instante**, con las notificaciones de la app de MercadoLibre: se configura en la app la URL `/api/webhooks/portals/mercadolibre` y los tópicos `vis_leads` e `items` (este, para los cambios de los avisos). MercadoLibre avisa y el sistema vuelve a leer de la API. Una ráfaga de avisos se junta en una lectura por minuto.
- Un contacto con el teléfono o el email mal cargado entra igual con el dato válido; el inválido queda escrito al final del mensaje. Solo se descarta si no trae ningún dato válido.
- Entran preguntas (con su texto), WhatsApp, llamadas, pedidos de contacto, visitas y cotizaciones de usuarios con sesión (la de un emprendimiento publicado por el sistema, con su unidad). Los anónimos no traen datos y no entran.
- Si el aviso es del sistema, la consulta queda con su propiedad. Los avisos de Tokko, hasta vincularlos, entran sin propiedad.

**Zonaprop (#14)**: por la API de Open Navent, con las credenciales de integrador de Norde (sin OAuth). Cinco etapas, detrás de `PORTALS_ENABLED`. Decisiones técnicas en los ADR 0026 a 0030 y 0047 (auditoría #162).

1. **Conexión** (hecha):
   - Mi empresa → Portales suma la tarjeta **Zonaprop**. Se conecta con el **código de inmobiliaria**; el sistema lo busca entre las inmobiliarias que Zonaprop asoció a Norde.
   - Un código que no está asociado, o una inmobiliaria bloqueada por Zonaprop, no se conecta y se explica por qué.
   - Conectada, la tarjeta muestra los **créditos disponibles** por plan, leídos de Zonaprop en el momento. Si Zonaprop no responde, se avisa en la tarjeta. En la ficha, los créditos se recuerdan 2 minutos.
   - Se activa para publicar como las cuentas de ML.
2. **Publicar propiedades** (hecha):
   - Se publica **a pedido**, desde la pestaña Difusión de la ficha. Después, los cambios de precio, datos, fotos y estado se sincronizan solos, como en ML.
   - **Un solo aviso por propiedad**, con todas las operaciones que tienen precio (consume un crédito). Las operaciones "a consultar" no se publican; sin ninguna con precio, no se publica.
   - Si una propiedad publicada **se queda sin precio** (todas "a consultar"), el aviso pasa a offline con el motivo a la vista, y vuelve online solo cuando tiene precio. Vale también para MercadoLibre.
   - Se elige el **plan** entre los de la cuenta para propiedades (hoy Simple y Home), con los créditos que le quedan a cada uno. No viene uno elegido de antemano. Un plan sin créditos no se puede elegir. Desarrollos home queda para los emprendimientos.
   - Se puede **cambiar el plan** de un aviso publicado: consume un crédito del plan nuevo. **Reactivar** un aviso pausado también consume uno: antes se revisa que queden.
   - Pausar nunca falla por el contenido: si falta algo que Zonaprop exige, se pausa igual y se manda al reactivar.
   - Cambiar el **pie para portales**, el link de la web o el contacto de una **sucursal** actualiza todos los avisos. Las fotos de una unidad actualizan el aviso de su emprendimiento.
   - Las publicaciones que quedan **con error** porque Zonaprop no respondió se vuelven a intentar solas una vez por día. Las que fallaron por falta de créditos, cuando cambia la propiedad o con "Sincronizar".
   - **Conciliación diaria**: a la mañana se lee de Zonaprop si cada aviso está online. Uno que Zonaprop puso offline por su cuenta (plan vencido, calidad, fotos) queda pausado con el motivo, para resolverlo y sincronizar. De paso se guarda el link de los avisos que no lo tenían.
   - **Reservada o pausada**, el aviso pasa a offline en Zonaprop, y vuelve online cuando la propiedad está disponible otra vez. El crédito se usa mientras el aviso está online: offline lo libera. Vendida, alquilada o dada de baja, sale de Zonaprop.
   - Pide **coordenadas** (latitud y longitud): de ahí sale la ubicación en Zonaprop. Las propiedades se ubican en el mapa al guardar la dirección.
   - Galpón se publica como Bodega-Galpón y Depósito como Depósito.
   - La ficha muestra **"Ver en Zonaprop"** con el link del aviso.
3. **Vincular los avisos que hoy publica Tokko** (hecha), sin republicarlos: conservan su antigüedad, sus visitas y sus consultas.
   - **Mi empresa → Portales → Avisos en Zonaprop** lista los avisos online de la cuenta, de a una página, y propone la propiedad cuyo código de referencia es la clave interna del aviso. Se vincula con un clic.
   - Los que no coinciden se vinculan **a mano desde la ficha**, en Difusión, pegando el link del aviso.
   - El aviso **queda como lo dejó Tokko** hasta que cambie algo de la propiedad en el sistema; desde ahí lo actualiza el sistema. Usa el plan con el que estaba publicado; si Zonaprop no lo informa, se elige.
   - Los emprendimientos se vinculan aparte (etapa 5). Tampoco se vincula un aviso ya vinculado, ni una propiedad que ya tiene aviso en Zonaprop.
   - Antes de vincular en producción hay que apagar la publicación de Tokko en Zonaprop.
   - **Pendiente:** Zonaprop tiene que habilitar "asociar avisos" para el integrador de Norde. En el sandbox responde que no hay permiso.
4. **Consultas**: los contactos de los avisos entran a la **bandeja de consultas** con canal Zonaprop.
   - Entran solos **cada 10 minutos**, leídos de Zonaprop (los de los últimos 2 días, o desde la última lectura completa si el sistema estuvo caído, hasta 14 días; los que ya estaban no se repiten).
   - **Al instante**, si se activan los avisos desde Mi empresa → Portales ("Recibir las consultas al instante"). Zonaprop avisa por cada contacto y el sistema los vuelve a leer de la API.
   - Entran los que traen teléfono o email: mensajes, "que me llamen", visitas, tasaciones y "ver teléfono" o "ver WhatsApp" de usuarios con sesión. Los anónimos sin datos no entran.
   - Sin texto, la consulta dice qué pidió la persona ("Pidió que lo llamen"). Si el aviso es del sistema, la consulta queda con su propiedad. Si es de Tokko y todavía no se vinculó, queda con la propiedad cuyo código es la clave interna del aviso.
   - Un teléfono mal escrito ("4444-5555") no frena la consulta si trae un email válido (ni al revés): entra con el dato válido y el otro queda escrito en el mensaje. Vale para todos los canales.
5. **Emprendimientos** (en curso, ADR 0030): el emprendimiento con todas sus unidades en un aviso de desarrollo.
   - Se publica a pedido desde la pestaña **Difusión** del emprendimiento, con un plan de emprendimientos (hoy Desarrollos home) con créditos.
   - Lleva las unidades **disponibles con precio**. Las reservadas, vendidas, pausadas o "a consultar" no van.
   - Se publica un emprendimiento **Comercializando** con al menos una unidad así. Si vuelve a "Cargando información" o se queda sin unidades, el aviso sale de Zonaprop (libera el crédito). Vuelve solo cuando hay unidades otra vez. En la papelera, se da de baja.
   - Zonaprop pide el tipo (vertical: edificio u oficinas; horizontal: barrio, complejo o loteo), la etapa de la obra, la fecha de entrega, la ubicación en el mapa, un título de al menos 10 caracteres y una descripción de al menos 50. La ficha dice qué falta antes de publicar.
   - Cada cambio del emprendimiento, de sus fotos o de sus unidades actualiza el aviso. Las unidades se publican solo dentro de su emprendimiento, nunca sueltas.
   - Una consulta por el aviso entra con el emprendimiento. Una consulta por una unidad entra con la unidad.
   - **Vincular los de Tokko**: en Mi empresa → Portales → Avisos en Zonaprop → Emprendimientos, cada emprendimiento online se empareja con el de Norde que tiene su clave interna como código. Desde la ficha se vincula pegando el link.
     - Cada unidad del portal se toma para la unidad de Norde con el mismo código. Las que no tienen par salen del aviso en el próximo envío.
     - Igual que con las propiedades, el aviso queda como lo dejó Tokko hasta que cambie algo del emprendimiento o de sus unidades.
     - Necesita el mismo permiso de Zonaprop que los avisos sueltos.
   - **Pendiente:** probar online un emprendimiento real. En el sandbox la cuenta no tiene créditos de Desarrollos home.

---

**Difusión: resumen y pantalla por portal (#114).** Menú Cartera → Difusión (`/difusion`), con `portals:publish` o `portals:manage` y la función prendida. Es una lectura del módulo `reporting`, que cruza `portal_listings` con propiedades y emprendimientos.

- **Resumen**: por tipo (propiedades sueltas disponibles, sin las unidades; emprendimientos en comercialización), cuántos hay, cuántos están en la web y cuántos tienen algún aviso online en cada portal prendido, con un acceso a los que faltan publicar.
- **Por portal**: una tarjeta por cuenta prendida con sus contadores (Publicadas, Simples, Destacadas, A revisar, Con error, Publicando, Pausadas y Sin publicar). La regla de cada contador está en `reporting/domain/publication-buckets.ts` y en `docs/negocio/decisiones.md` (2026-10-23).
- Cada contador abre `/difusion/<portal>?kind=property|development&bucket=…`: el listado paginado en el servidor, de lo último que cambió hacia atrás, con la ficha (pestaña Difusión), el aviso (operación, tipo o plan), el estado con el motivo del portal y "Ver en …". En Zonaprop se elige entre propiedades y emprendimientos.
- Índice nuevo `portal_listings_portal_status_updated_idx` (migración `0040`); el test de integración verifica que ningún contador ni listado recorra la tabla entera.
- Tokko separa "simples" y "premium": acá las destacadas incluyen los planes pagos de Zonaprop. Las redes sociales y el carrusel siguen afuera.

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
- **Propietario** (opcional, privado): un contacto activo, buscado entre los que el usuario ve (#107). Si son varios, el resto se suma desde la ficha. Queda en el alta del historial, con el contacto en `client_ids`.

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

- **Exportar** a Excel o CSV. Hasta 10 con `properties:export`; más, con `properties:export-bulk`. Se arma por lotes, hasta 5.000 filas, y queda en la auditoría con el filtro, la cantidad y si incluyó propietarios. Lleva las columnas de la planilla de Tokko (#175): dirección interna y para publicar, ubicación, emprendimiento, precio de cada operación, expensas, ambientes, dormitorios, baños, toilettes, cocheras, antigüedad, superficies (total, cubierta, semicubierta y terreno), frente y fondo, captador, usuario de mantenimiento, sucursal y fechas. Con "Ver datos de propietarios" (`clients:read-owners`) suma el primer propietario: nombre, email y celular. En el Excel, los números, montos y fechas son celdas numéricas y de fecha (se pueden ordenar y sumar); el CSV va con `;` y coma decimal.
- **Exportar a PDF** (#175): la ficha de las propiedades elegidas en uno de los formatos de Tokko, mejorados:
  - Horizontal: una hoja apaisada por propiedad, con los datos a la izquierda y el precio, ocho fotos y el agente a la derecha.
  - Horizontal con mapa: igual, con el mapa en lugar de la segunda foto grande.
  - Vertical: la ficha completa en hojas A4, con la portada, la descripción entera y todas las fotos.
  - Vertical con mapa: suma la ubicación antes de las fotos.
  - Grilla comparativa: una tabla agrupada por tipo, con foto, código, precio, ambientes, dormitorios, baños, superficies, expensas y antigüedad.

  Mismos permisos que la planilla, hasta 100 propiedades. Las propiedades se fijan al pedirlo, ordenadas por código. Lo arma un job; la barra de procesos avisa y lo descarga quien lo pidió (o quien exporta en cantidad). Queda en la auditoría.

- El mapa de los PDF se arma con las teselas de OpenStreetMap (las del mapa del panel), con el marcador en la ubicación exacta. Si el servicio no responde, sale una foto en su lugar. `MAP_TILES_URL` cambia el proveedor.
- **Favoritas**: solo sobre las marcadas en la página.
- **Comparar**: de 2 a 4 marcadas, lado a lado (precio, superficies, ambientes, dormitorios, baños, cocheras, antigüedad, ubicación y estado).
- **Edición rápida** (`properties:bulk-edit`, y sobre cada propiedad poder editarla): un campo por vez, hasta 2.000 propiedades, por lotes.
  - Estado: con las transiciones del dominio. "Disponible" exige `properties:mark-available`; "Reservada" no se elige a mano, la marca una reserva (#13).
  - Precio de una operación que la propiedad ya tiene (vacío: a consultar). Queda en el historial de precios.
  - Captador (`properties:change-producer`): la propiedad pasa a la sucursal del nuevo captador.
  - Etiquetas: agregar y quitar.
  - Publicación en la web (`properties:publish`): las opciones del botón "Publicación" de la ficha ("Publicar en web", mostrar el precio, mostrar la dirección exacta, destacada). Cada una se activa, se desactiva o queda como está. Se marca en cualquier estado: la web muestra la propiedad solo mientras esté disponible. Queda en el historial como `property.publication_changed`, igual que desde la ficha.
  - Las que no se pueden cambiar se informan con el motivo. Cada cambio queda en el historial de su propiedad.

**Transiciones de estado**: borrador → disponible o dada de baja; disponible → reservada, pausada, vendida, alquilada o dada de baja; reservada → disponible, vendida, alquilada o dada de baja; pausada → disponible o dada de baja; vendida o alquilada → disponible (se relista) o dada de baja; dada de baja → disponible o borrador.

**Mi empresa** (configuración con `settings:update`, etiquetas con `tags:update`):

- **Propiedades**: columnas del buscador y tipos de propiedad. Un tipo deshabilitado no se ofrece en el alta (sus propiedades siguen en la cartera); siempre queda al menos uno. Cada tipo elige qué atributos muestra su ficha, con una configuración recomendada para volver.
- **Ubicaciones**: país > provincia > localidad > barrio > subbarrio. El nivel es el siguiente al de la ubicación de la que depende. Vienen cargadas las provincias, los barrios de CABA, el Gran Buenos Aires y las ciudades principales. No se repite un nombre bajo el mismo padre.
- **Servicios y ambientes**: servicios, ambientes y adicionales. Un ítem no se borra: se desactiva.
- **Etiquetas**: sueltas o en grupos. Un grupo con etiquetas o una etiqueta en uso no se borran.

**Pendiente de #5**: el panel "Más filtros" (se define con Norde qué filtros sirven) y el envío por email o WhatsApp (#8 y #11).

### 4.8 Ficha de propiedad (#6)

Pantalla propia en `/propiedades/[id]`, con las pestañas en la URL (`?tab=`). La grilla y las tarjetas del buscador enlazan a la ficha.

**Cabecera**: foto de portada, estado (con "Cambiar estado", con las transiciones de §4.7), tipo, código, ubicación, dirección para publicar y la real, favorita, "Publicación" (publicar en web, con o sin precio, dirección exacta y destacada, con `properties:publish`) y las acciones: ver en el mapa, estadísticas, PDF de la ficha, PDF de vidriera y reporte al propietario.

- "Publicar en web" se marca en cualquier estado: la web la muestra solo mientras está disponible.
- La vista previa (`/propiedades/<id>/vista-previa`) muestra la propiedad como la vería un visitante (fotos para la web, dirección y precio según la publicación) aunque no esté publicada. No está en el menú de la ficha.

**Detalles**: cada bloque se edita en el lugar y guarda con su propio caso de uso, con el diff en el historial.

- Operaciones: venta, alquiler y temporario, cada una con precio, moneda, "precio a consultar" y comisión (0 a 100 %, con dos decimales). Al menos una. Cada cambio de precio va al historial de precios y emite `PropertyPriceChanged`. Cada operación se muestra como una tarjeta con el precio, el precio por m² (sobre la superficie total) y la comisión estimada (el porcentaje aplicado al precio). Con permiso de edición, las operaciones que faltan aparecen juntas en una tarjeta ("Agregar venta", etc.) y abren la edición con esa operación ya sumada.
- Condiciones: exclusividad, permuta, escritura inmediata, financiación, apto crédito y expensas (en pesos).
- Características: ambientes, superficies y medidas, antigüedad, orientación, estado de conservación y disposición. La superficie cubierta más la semicubierta no supera la total. Se muestran los atributos que el tipo de propiedad tiene habilitados en Mi empresa.
- Ubicación: dirección real (privada), dirección para publicar (vacía: se sugiere), ubicación del catálogo y coordenadas. Si cambia la dirección y no hay coordenadas cargadas a mano, se ubica de nuevo en el mapa.
- Título para portales y descripción. Servicios, ambientes y adicionales como checklists del catálogo. Etiquetas. Atributos personalizados (se definen en Mi empresa → Propiedades: texto, número, sí o no, o lista; no se borran ni cambian de tipo, se desactivan). **Ocultos (#50)**: Norde no creó ninguno en Tokko; con `CUSTOM_ATTRIBUTES_ENABLED=false` (por defecto) no se muestran ni en Mi empresa ni en la ficha.
- Información interna: código de referencia (editable, sin repetir), captador (`properties:change-producer`), tasadores, usuario de mantenimiento, ubicación de las llaves, información legal y comentarios internos.
- Propietarios (#107): se ven con enlace a su ficha de contacto. Con el mismo permiso que el captador ("Cambiar el productor o los propietarios") se suman y se quitan de a uno, hasta 20: un contacto en la papelera o unificado no se puede sumar, y quitarlo no borra el contacto. Cada cambio queda en el historial de la propiedad (`property.owner_added`, `property.owner_removed`, filtro "Captador, propietarios y etiquetas") con el contacto en `client_ids`, así la supresión lo borra. La unificación de contactos mueve los vínculos y la supresión los quita (§3.3.2 y §3.3.4).

**Multimedia**: fotos y planos (JPG, PNG o WebP, hasta 15 MB, hasta 100 ítems por propiedad), videos (YouTube, Vimeo) y recorridos 360 (Matterport, Kuula, Roundme) por link.

- Se suben varias a la vez (de a 3). La primera es la portada. Cada foto aparece enseguida como una tarjeta más de la galería, al final (donde queda), con la vista previa del navegador y su estado encima: "En espera", "Subiendo…" y después "Generando variantes", sin que la imagen salte cuando llega la del servidor. Si una no se puede subir, su tarjeta muestra el motivo y deja reintentar o quitarla.
- Se ordenan arrastrando. Por foto: portada, mostrar en la web, incluir en el PDF, es plano, rotar, descripción, bajar la original y borrar.
- La original no se modifica: un job genera la miniatura, la versión web y la copia con marca de agua (ADR 0020). Mientras tanto, la foto se ve "Generando variantes" (ya está subida; no dice "Procesando" para que no parezca que se sigue cargando). Si no se puede (la imagen está dañada, falta la original o el storage no responde), queda "No se pudo procesar"; ante un error del storage, el job la reintenta y, si sale bien, queda lista.

**Archivos**: escrituras, reglamentos y planos (PDF, imágenes, Word o Excel, hasta 25 MB), con "Mostrar en la web", renombrar, bajar y borrar (baja lógica).

**Historial**: cada cambio con quién y cuándo, campo por campo (antes → después), paginado. Se filtra por tipo de cambio (datos, precio, estado, fotos y videos, archivos, publicación, captador y etiquetas, reservas) y por fechas. Los cambios de fotos y archivos aparecen en el historial de la propiedad. Ver el historial de lo propio pide `audit:read`; el de otros, `audit:read-others`.

**Contactos**: potenciales interesados (clientes con búsquedas guardadas que coinciden con la propiedad: misma operación, tipo, ubicación o una que la contiene, ambientes y precio en la misma moneda) e historial de envíos de la ficha con lo que hizo el cliente (abrió, le gustó, no le gustó). Solo los clientes que el usuario puede ver. Los envíos los crea #11.

**Estadísticas**: envíos por email y WhatsApp, interesados, consultas recibidas y publicaciones activas; gráfico mensual (3, 6, 12 o 24 meses, en hora de Buenos Aires); perfil de los interesados por etiqueta y publicaciones por portal.

**PDF** (con `properties:export`, queda en el historial): ficha en el formato que se elige (horizontal o vertical, con o sin mapa, los mismos de "Exportar a PDF" del buscador; se arma con react-pdf, ADR 0051, y se descarga como `<código>.pdf`), vidriera (un afiche de una hoja, con react-pdf: vertical u horizontal; 1 o 3 fotos, que se eligen en orden entre las marcadas para el PDF y si no se eligen van las primeras de la ficha; banda con la operación sobre la foto; código, título, dirección, m², ambientes, dormitorios, baños y cocheras; la descripción con el tamaño de letra elegido, de 30 a 50 en la escala de Tokko, que se achica sola hasta que todo entre en la hoja y, al mínimo, se recorta con "…"; el precio grande; una franja con el WhatsApp, el teléfono, el email y la dirección de la sucursal y los datos del agente; QR a la ficha web si se pide y la propiedad está publicada; colores principal y secundario, por defecto los de la marca; el diálogo recuerda la última elección en el navegador) y reporte al propietario (con react-pdf; un período de hasta un año, con atajos de los últimos 15 y 30 días y desde el alta: la tarjeta de la propiedad con foto, datos clave y precio; una tabla que compara los envíos por email y por WhatsApp y las consultas de los últimos 15 y 30 días y desde el alta; visitas y contactos en los portales, envíos, consultas e interesados del período, con el gráfico mes a mes; si se piden, las estadísticas de cada portal y cuenta, con lo que significa cada número, y las publicaciones activas con el logo del portal, la operación, el precio y el link a la web y a cada aviso; al final, "Tu productor" (el productor de la propiedad o quien lo pidió, si van los datos del agente) y el logo y el contacto de la empresa). Todos llevan el logo de Mi empresa (el nombre en texto solo si no hay logo o no se puede leer) y su **color de marca** en títulos, badges, íconos y el gráfico (la vidriera usa su color principal, que propone el de Mi empresa); la ficha y el reporte, además, un pie con el contacto de la sucursal de la propiedad (o la casa central) y el número de página. El contacto es el texto libre de la sucursal; si no tiene, el de Mi empresa; si tampoco, la dirección, los teléfonos y el email de la sucursal. Siguen "Ficha y PDF" de Mi empresa (dirección al descargar, precio, contacto de la empresa y datos del agente: siempre, nunca, o se pregunta al armar el PDF). Los arma un job; el diálogo muestra el estado y se descargan cuando están listos. El reporte se puede mandar por email con el PDF adjunto: el email del propietario no queda en el historial.

**Planilla de tasación** (Más acciones → Exportar, con `properties:export`): el "PDF de tasación" de Tokko, una hoja para imprimir y completar a mano en la visita. Arriba, el código, el tipo, la fecha, la dirección completa (es interna), la ubicación y, solo con `clients:read-owners`, los propietarios con su teléfono, celular y email. Información general y superficies con lo que ya está cargado y una línea para completar lo que falta; el recuadro "Tasación" con $ y U$S para venta, alquiler y alquiler temporario; servicios, ambientes y adicionales del catálogo (hasta 40 por grupo, más los que ya tenga) como casillas, marcadas las que ya están en la ficha; renglones para la descripción, e información interna (tasador, productor, comisión de cada operación, comisión del productor para completar y llaves). Se arma en el momento, sin job, como `Planilla-tasacion-<código>.pdf`; la descarga queda en el historial.

**Pendiente de #6**: compartir por email o WhatsApp (#11) y "Completar con IA". Los interesados, envíos, consultas y publicaciones se ven vacíos hasta que #8, #10, #11 y #14 escriban esos datos. Descripción y PDF solo en español.

### 4.9 Reservas (#13)

Una **reserva** es la seña de un contacto sobre una propiedad. Vive en el módulo `properties` porque cambia el estado de la propiedad en la misma transacción.

**Reservar** ("Reservar" en la cabecera de la ficha o en una destacada del contacto, con `reservations:create`):

- Solo una propiedad **disponible**, fuera de la papelera y que ofrezca la operación elegida. Pasa a **reservada** y deja de mostrarse en la web.
- Datos: contacto, operación, agente (sin elegir, quien reserva), gerente (opcional, cualquier usuario activo), valor y moneda, comisión en porcentaje y/o monto con su moneda (todo opcional), fecha estimada de firma y notas. Desde una destacada, el contacto viene elegido y la reserva queda atada a la oportunidad de la destacada.
- La sucursal de la reserva es la del agente.
- **Una sola reserva activa por propiedad**: lo exige el dominio (la propiedad tiene que estar disponible) y un índice único parcial en la base, también si dos la reservan al mismo tiempo.

**Estados**: activa → caída o firmada. Caída y firmada son finales.

| Acción                                                  | Permiso               | La propiedad                                       |
| ------------------------------------------------------- | --------------------- | -------------------------------------------------- |
| Editar (valor, comisión, fecha, agente, gerente, notas) | `reservations:update` | No cambia                                          |
| Dar por caída (con motivo opcional)                     | `reservations:update` | Vuelve a disponible                                |
| Firmar                                                  | `reservations:update` | Venta → vendida; alquiler o temporario → alquilada |

El contacto y la operación no se editan: si cambian, la reserva se da por caída y se reserva de nuevo. De fábrica, gerente y administrador tienen `reservations:*`; el agente, ver y crear.

**Mientras hay una reserva activa**, el estado de la propiedad no se cambia a mano (ficha, edición rápida o masiva, importación de unidades) y no se puede mandar a la papelera.

**En la ficha**: la tarjeta de la reserva activa (debajo de la cabecera, con Editar, Dar por caída y Firmar) y la pestaña **Reservas**, paginada, con todas las de la propiedad (contacto, estado, agente, valor, comisión, fecha de reserva y firma estimada), ordenable por fecha de reserva o de firma.

**Historial**: cada paso queda en el historial de la propiedad (filtro "Reservas") con su diff y el ID del contacto en `client_ids`: `property.reserved`, `property.reservation_updated`, `property.reservation_fallen`, `property.reservation_signed`. Al suprimir los datos de un contacto se borran sus reservas; si una estaba activa, la propiedad vuelve a disponible y queda `property.reservation_erased`, sin el contacto.

**Listado `/reservas`** (menú Cartera → Reservas, con `reservations:read`): todas las reservas, activas, caídas y firmadas, incluidas las de propiedades en la papelera. Lo ve todo el que ve reservas, de cualquier agente o sucursal.

- Columnas: propiedad (código, tipo y dirección), cliente y operación, estado (el motivo de la caída al pasar el mouse), agente y gerente, valor, comisión, fecha de reserva y fecha estimada de firma. Cada fila abre la pestaña Reservas de la propiedad.
- Filtros: estado, operación, tipo de propiedad y, en "Más filtros", agente, gerente, sucursal (la de la reserva), fecha de reserva y fecha estimada de firma (desde/hasta, días de Buenos Aires, inclusive). Paginado en la base, ordenable por fecha de reserva (de fábrica, la más nueva primero) o de firma (las que no tienen fecha, al final).
- **Exportar a Excel** (`reservations:export`; de fábrica, gerente y administrador): todas las que cumplen los filtros, hasta 10.000, con todas las columnas más las fechas de firma y caída, el motivo y las notas. Se arma por lotes y queda en la auditoría (`reservation.exported`, con los filtros y la cantidad).
- **Imprimir**: la página que se está viendo, sin el menú, los filtros ni la paginación, siempre en tema claro. Para imprimir más filas, se agranda el tamaño de página.

**No se construye**: la configuración de Reservas de Tokko (etiqueta obligatoria, gerentes de reservas, gerente obligatorio, a quién notificar); por eso el filtro de gerente ofrece cualquier usuario. Las reservas por vencer se ven en Inicio, en "Próximos vencimientos" (§7.0); el aviso por notificación va con #16.

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

### 4.10 Importar propiedades de Tokko (#17)

**Importar** (`/propiedades/importaciones`, permiso `properties:import`, desde "Importar de Tokko" en el buscador): el historial de importaciones, paginado, con su estado (En proceso, Listo, Error). Es parte de la migración desde Tokko; no es la función de Tokko de importar listas de propiedades, que no se construye (§13.1).

1. Se sube la exportación de propiedades de Tokko (`.csv`, también guardada como Excel), de hasta 5 MB y 2.000 filas. El servidor la lee (el navegador no procesa el archivo), verifica que tenga las columnas de Tokko (Ref, Dirección y Tipo de propiedad, como mínimo) y muestra cuántas propiedades trae y qué datos se leen. No hay que elegir columnas: son las de Tokko.
2. Al confirmar se guarda el archivo y un job de `apps/gestion` (`properties.import_requested`) crea una propiedad por fila. Cada fila va en su propia transacción con el avance: si el job se corta, retoma donde quedó. Al terminar se borra el archivo, que tiene datos personales.

Cada propiedad:

- **Código**: el "Ref" de Tokko, en mayúsculas y con guiones en lugar de espacios ("NBU12345 AP1234567" → "NBU12345-AP1234567"). Si ya hay una propiedad con ese código, la fila no se importa ("Ya estaba en Norde con ese código"); si está en la papelera, tampoco. Importar dos veces el mismo archivo no duplica nada.
- **Estado**: disponible. Sin fotos ni descripción (la exportación no las trae; llegan con la API de Tokko) y sin coordenadas (no se geocodifica en la importación).
- **Ubicación** (decidido el 2026-10-20): "Capital Federal" es CABA, con su barrio del catálogo. Las regiones del GBA y la costa son de Buenos Aires: la localidad va bajo su partido (Ramos Mejía, San Justo, Lomas del Mirador y Tablada → La Matanza; Haedo → Morón; Ciudadela → Tres de Febrero; Olivos → Vicente López; Pinamar Norte → Pinamar) y, si no está en la tabla, la localidad es el partido. Si la localidad o el barrio no existen en el catálogo, se crean (auditados). Otro país (Uruguay) queda como texto.
- **Dirección**: calle, altura, piso y unidad ("Belgrano 123, PB", "Rivadavia 9540 4º A", "Piso 4 Departamento A", "3º UF 12"). Lo que no se entiende queda como piso.
- **Operaciones**: venta, alquiler y temporario con su moneda ("USD 130.000", "$ 630.000"); con dos monedas en una celda, la de dólares. Sin ninguna, la fila no se importa.
- **Características**: superficies (0 es "sin dato"), frente, fondo, ambientes, dormitorios, baños, toilettes, cocheras y antigüedad ("-1" es "sin dato"). Si la total es menor que la cubierta más la semicubierta (Tokko redondea), se importa sin la total, con un aviso.
- **Expensas**: en pesos; 0 es "sin expensas".
- **Plantas, ocupación, zonificación y superficie descubierta**: Norde no las modela; van a los comentarios internos, bajo "Datos de Tokko".
- **Productor**: el usuario activo con ese nombre (sin distinguir mayúsculas ni acentos), con su sucursal; "Libre" o un nombre que no es un usuario, quien pidió la importación.
- **Propietario**: el contacto con ese celular o email (la regla de duplicados de contactos) o uno nuevo como propietario vendedor o locador, a cargo del productor. Sin un teléfono ni un email válidos, la propiedad se importa sin propietario, con un aviso.
- **Emprendimiento**: Tokko suma el estado de obra al nombre ("AV. RIVADAVIA 9540 + EN POZO"); sin eso, si hay un emprendimiento activo con ese nombre, la propiedad queda como su unidad (también en el historial del emprendimiento). Si no hay uno, se importa suelta, con un aviso.

El reporte de cada importación muestra las filas, las creadas, las que ya estaban y las que tuvieron errores, y las filas con problemas: los errores (la fila no se importó) y los avisos (se importó con algo ajustado), con un enlace a la propiedad. No guarda datos personales: el número de fila, el motivo, la columna y el ID de la propiedad. Las propiedades quedan auditadas como `property.imported` (`system:import`), agrupadas por la importación, con el propietario en `client_ids`.

**Traer de la API de Tokko** (decidido el 2026-10-20): con la API key de Norde en Tokko configurada (`TOKKO_API_KEY`), el mismo historial muestra "Traer de la API de Tokko". Un job de `apps/gestion` (`properties.tokko_api_import_requested`) trae primero los **emprendimientos** (`/api/v1/development/`) y después las **propiedades** (`/api/v1/property/`), de a 20 y en el orden de Tokko; así las unidades quedan vinculadas en la misma corrida.

**Emprendimientos** (decidido el 2026-10-20). Se buscan por el código de Tokko ("NBU58303") y, si no hay, por el nombre (los cargados a mano en Norde).

- **Si no existe**, se crea con el código de Tokko como código (como las propiedades), el nombre sin el estado que Tokko le suma ("AV. RIVADAVIA 9540 + EN POZO" → "AV. RIVADAVIA 9540"), la dirección, la ubicación del catálogo (con el partido que trae la API; otro país no se importa), el título, la descripción, la financiación, las coordenadas y las fotos. Queda **comercializando** si estaba publicado en la web de Tokko; si no, cargando información. El captador es el usuario a cargo en Tokko con ese nombre o, si no hay, quien pidió la importación.
- **Estado de obra**: Tokko lo da como número; en la cartera de Norde, 3 es "en pozo", 4 "en construcción" y 6 "terminado" (visto contra el estado que escriben en el nombre). Otro número queda sin estado. La entrega es la fecha de obra de Tokko.
- **Si ya existe**, se completa sin pisar nada: la descripción, la financiación, el estado de obra, la entrega y las coordenadas que falten, y las fotos si la galería está vacía (`development.import_completed`).

**Propiedades**, con las mismas reglas que la exportación (código, tipo, ubicación, operaciones, medidas, productor, emprendimiento: primero por el código de Tokko del emprendimiento y después por nombre). Además:

- **Si el código no existe**, crea la propiedad con lo que la exportación no trae: el título para portales, la descripción, las coordenadas, los comentarios internos de Tokko (bajo "Comentarios de Tokko"), todos sus propietarios (Tokko puede tener más de uno) y las fotos. Cada propietario se busca primero por su **ID de contacto de Tokko** (el mismo que guarda la importación de contactos), después por teléfono o email, y si no hay uno se crea; el ID queda guardado. Si en Tokko no tiene un teléfono ni un email válidos, se crea igual **solo con el nombre** (decidido el 2026-10-20: si Tokko lo permite, Norde también); el ID evita duplicarlo en cada unidad. El alta manual de contactos sigue pidiendo un teléfono o un email. Un contacto que pidió la supresión de sus datos no se vuelve a crear. Si la web de Tokko no mostraba el precio, la operación queda "a consultar". La ubicación usa el partido que trae la API ("Argentina | G.B.A. Zona Oeste | La Matanza | Ramos Mejia"); la tabla fija queda para la exportación.
- **Si ya existe** (por ejemplo, importada desde la exportación), la **completa sin pisar nada**: la descripción y el título si no tiene descripción, las coordenadas si no tiene, los comentarios de Tokko si no están, el emprendimiento si está suelta y en Tokko es unidad de uno que está en Norde (también en el historial del emprendimiento), los propietarios si no tiene ninguno (`property.owners_imported`), y las fotos si la galería está vacía. Queda auditado como `property.import_completed` con el diff. Lo cargado en Norde no se toca; actualizar lo que cambió en Tokko es del corte (etapa 4).
- **Las fotos** (de propiedades y de emprendimientos) se bajan de los servidores de Tokko (`static.tokkobroker.com`, la original o, si no sirve, la versión web) al storage, en el orden de Tokko, con su portada y los planos como planos; como mucho las 100 de la galería. Quedan "Generando variantes" hasta que el job de siempre las genera. Si alguna no se pudo bajar, queda un aviso.
- **Una sola a la vez**: mientras hay una pendiente o en proceso, no se puede pedir otra (bajarían dos veces las mismas fotos). El job puede tardar horas (unas 2.800 fotos en la cartera actual): se retoma donde quedó si se corta (los emprendimientos, si no terminaron, se vuelven a recorrer), y volver a traerlas no duplica nada. Si Tokko no responde o rechaza la key, la importación queda con error y lo hecho hasta ahí.

En el reporte de una importación desde la API, los emprendimientos tienen sus propios totales; las "Completadas" son las que ya estaban y recibieron algo, y los problemas se listan por el código de Tokko en lugar del número de fila, marcando los de emprendimientos. La key va en la URL de cada pedido (como pide Tokko): nunca se loguea.

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

La issue #12 se parte en tres etapas: (1) listado, alta, edición, estados y papelera, (2) resultado (valores sugeridos y comparables), fotos y convertir en propiedad, (3) informe en PDF con la marca de Norde. El ingreso desde el agente de IA (`request_appraisal`) y desde el formulario de la web queda para después (depende de #53). Esta sección describe las tres etapas.

### 6.1 Listado (`/tasaciones`)

- Grilla paginada en el servidor: código (`TAS0001`, numeración propia de las tasaciones), tipo y dirección, solicitante, estado, productor y tasador, sucursal, visita y alta. Ordena por código, visita o alta.
- Filtros: estado agrupado como en Tokko (**Pendientes** = solicitada o con visita agendada, **Tasadas**, **Descartadas**, **Ingresadas** = convertidas en propiedad), tipo de propiedad y, en "Más filtros", productor, tasador, sucursal, fecha de alta y fecha de visita.
- **Quién ve qué**: cada uno ve las tasaciones que produce o que tiene asignadas como tasador. Con "Ver tasaciones de otros" (`appraisals:read-others`, gerencia) ve todas. Una tasación que no ve no existe para él, tampoco en la ficha.
- Papelera con restaurar, con `appraisals:delete`.
- **Exportar a Excel** (#175), con "Exportar tasaciones" (`appraisals:export`): las que cumplen los filtros aplicados y el usuario puede ver, por lotes y hasta 10.000. Lleva las columnas de Tokko (código, estado, tipo, dirección, solicitante, productor, tasador, sucursal, alta y última modificación) más ambientes, superficies, visita y los valores tasados de venta y alquiler (moneda, desde y hasta), que Tokko no exporta. Queda en la auditoría con el filtro y la cantidad.

### 6.2 Alta y ficha (`/tasaciones/nueva`, `/tasaciones/[id]`)

La tasación tiene pantalla propia (no panel lateral).

- **Solicitud**: solicitante (el cliente propietario, obligatorio), productor (quien trae la tasación; sin elegir, quien la carga), tasador (opcional hasta asignarlo) y visita (día y hora de Buenos Aires). La sucursal es la del productor.
- **Propiedad**: tipo (obligatorio), dirección, superficie total y cubierta (m², hasta dos decimales), ambientes, dormitorios, baños y estado de conservación. Los catálogos son los de las propiedades, para poder convertirla.
- La ficha tiene las pestañas **Datos** (el mismo formulario, editable), **Resultado**, **Fotos** e **Historial** (quién cambió qué y cuándo).
- **Resultado**: valor sugerido de venta y de alquiler, cada uno con mínimo y máximo en su moneda (se cargan los dos o ninguno, y el mínimo no supera al máximo); **comparables**, hasta 20; y observaciones. Los comparables son propiedades parecidas de la zona, publicadas o vendidas, que respaldan el valor: se cargan a mano (dirección, precio y moneda, superficie, link a la publicación y nota), porque suelen ser de portales o de otras inmobiliarias. El panel muestra el valor por m² de cada uno, que calcula el dominio.
- **Fotos** de la visita: hasta 30, JPG, PNG o WebP de hasta 15 MB. Se guarda la original en el storage privado y se sirve desde la ficha a quien ve la tasación. Una foto borrada se saca del storage con un job.
- Editar, cargar el resultado, subir o borrar fotos y cambiar el estado piden `appraisals:update`; borrar y restaurar, `appraisals:delete`. Todo eso además pide ver la tasación (ser productor o tasador, o "Ver tasaciones de otros").

### 6.3 Estados

**Solicitada → Visita agendada → Tasada → Ingresada (convertida)**, y **Descartada**.

| Desde           | Puede pasar a                             |
| --------------- | ----------------------------------------- |
| Solicitada      | Visita agendada, Tasada, Descartada       |
| Visita agendada | Solicitada, Tasada, Descartada            |
| Tasada          | Ingresada (solo al convertir), Descartada |
| Descartada      | Solicitada (se reabre)                    |
| Ingresada       | — (final)                                 |

- Para agendar la visita hace falta su fecha; con la visita agendada, la fecha no se puede borrar.
- Para marcarla **tasada** hace falta un valor sugerido (de venta o de alquiler); una tasada no se puede quedar sin valores.
- "Ingresada" no se elige a mano: la marca la conversión en propiedad. Una tasación ingresada ya no se edita, no cambia de estado y no suma ni borra fotos.
- Una tasación en la papelera no se edita.

### 6.4 Historial, supresión y unificación

- Todo cambio queda en el historial de la tasación (`appraisal.created`, `appraisal.updated` y `appraisal.result_recorded` con solo los campos que cambiaron, `appraisal.status_changed`, `appraisal.photo_added`, `appraisal.photo_deleted`, `appraisal.converted`, `appraisal.report_downloaded`, `appraisal.deleted`, `appraisal.restored`), con el solicitante en `client_ids`. Los montos se guardan en centavos con su moneda.
- Si se suprimen los datos del solicitante, sus tasaciones se borran físicamente por tandas, con su historial, sus fotos y los archivos de las fotos.
- Si se unifica el solicitante con otro contacto, sus tasaciones pasan al principal (`appraisal.client_merged`).

### 6.5 Convertir en propiedad

- "Convertir en propiedad", en la cabecera de una tasación **tasada**, pide `appraisals:update` y `properties:create` (dar de alta propiedades). Convertirla dos veces se rechaza.
- La tasación pasa a **Ingresada**, guarda el ID de la propiedad nueva y emite `AppraisalConverted` en la misma transacción (`appraisal.converted` en su historial).
- Un job de properties reacciona y crea la **propiedad en borrador** con ese ID: tipo, dirección (en la calle; altura, ubicación y coordenadas se completan en la ficha), superficies, ambientes, dormitorios, baños y estado de conservación, **una operación por cada valor sugerido, al máximo**, el productor como captador con su sucursal, el tasador, el **solicitante como propietario** y una copia de las fotos (la primera es la portada; se generan las miniaturas como en cualquier galería). El código de referencia sale de la numeración de Mi empresa. Queda en el historial de la propiedad (`property.created_from_appraisal`, con la tasación de origen).
- Mientras el job crea la propiedad, la ficha dice "Creando la propiedad…"; después muestra su código con el link. Es idempotente: si el evento llega dos veces, la propiedad no se duplica.
- Si las superficies de la tasación no cierran (cubierta mayor que la total), la propiedad se crea sin ellas.
- La ficha de la propiedad muestra la **tasación de origen** en "Información interna": código con link a la tasación, estado y valores sugeridos (#110). Se lee por la API pública de appraisals (`GetSourceAppraisal`, por el ID de la propiedad que guardó la tasación); solo la ve quien puede ver esa tasación (`appraisals:read`, con la regla de productor y tasador). Si la tasación está en la papelera, lo aclara.

### 6.6 Informe en PDF

- "Descargar PDF", en la cabecera, arma el **informe de tasación** para entregárselo al propietario. Está si la tasación está **tasada o ingresada** y tiene un valor sugerido; lo descarga quien puede ver la tasación (`appraisals:read`, con la misma regla de productor y tasador).
- Lleva el logo y el nombre de Mi empresa, el código, el tipo y la dirección, para quién se preparó, quién la tasó, los datos de la propiedad (superficies, ambientes, dormitorios, baños y estado), los **valores sugeridos** (mínimo y máximo de venta y de alquiler mensual), el **valor por m²** del rango sugerido (sobre la superficie total o, si no está, la cubierta), los **comparables** con su precio, superficie y valor por m² y su **promedio por m²** por moneda, las **observaciones**, las **fotos** (la primera arriba, el resto de a dos por fila, recortadas para imprimir), el contacto del tasador y de la sucursal, y un recuadro que aclara el alcance: valores orientativos, no es una tasación judicial ni bancaria. Se arma con react-pdf (ADR 0051), con la tipografía y los colores de los PDF de la ficha.
- Se arma en el momento, sin job: el archivo es `Tasacion-TAS0001.pdf` y no se guarda. Cada descarga queda en el historial (`appraisal.report_downloaded`).

---

## 7. Reportes

### 7.0 Inicio: pendientes y estado de la cartera (#15)

La pantalla de inicio del panel (`/`). Son consultas de solo lectura del módulo `reporting`: un caso de uso por widget, cada uno con su propio límite. Solo se consultan los widgets de la vista elegida.

**Alcance**: Inicio muestra la cartera con el alcance de los permisos de oportunidades. Un agente ve lo suyo, un gerente lo de su sucursal (`opportunities:read-branch`) y quien ve todas las oportunidades (`opportunities:read-all`), todo. Sin ese permiso, cada usuario ve solo lo suyo. Lo "suyo" es lo que tiene a cargo: el agente de la oportunidad y de la reserva, y el captador de la propiedad y del emprendimiento. Los filtros de **agente** (con `users:read`) y **sucursal** (con `branches:read`) achican el resultado, nunca lo amplían.

**Pendientes** (`/`): la pantalla empuja a actuar.

- **Franja de urgencias**: una tarjeta por pendiente, con el total, su urgencia (al día, pide atención, atrasado) y el caso más urgente ("La más vieja es de …, hace 19 días"). Las tarjetas son el filtro: debajo se ve solo la lista de la activa (`?pendiente=consultas|contactar|firmas|avisos`). Sin el param, arranca activa la más urgente.
- **Lista de la tarjeta activa**: sus primeras 5 filas, el total y "Ver las otras N"; "Ver todas" abre el módulo con los mismos filtros. Cada fila lleva su antigüedad pintada con la urgencia y sus acciones.
- **Urgencia** (decisión del 2026-10-19, regla en el dominio de `reporting`): consulta sin asignar u oportunidad sin contactar, ámbar al día y rojo a los 3 días; reserva, roja si la fecha estimada pasó y ámbar si es dentro de 7 días; aviso de portal, rojo con error y ámbar pausado.

| Widget                  | Qué muestra                                                                                                                                 | Acciones de cada fila                                                                         | Permiso                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Consultas sin asignar   | Las pendientes de la bandeja, la más vieja primero, con su antigüedad y el comienzo del mensaje. Se ven todas y solo las filtra la sucursal | Asignar (el diálogo de la bandeja) y WhatsApp                                                 | `inquiries:read`                                                          |
| Pendientes de contactar | Oportunidades en la categoría "nuevo", la que más espera primero (desde el último cambio de estado)                                         | WhatsApp, Llamar y "Ya lo contacté" (pasa al primer estado activo de la categoría contactado) | `opportunities:read`                                                      |
| Próximas firmas         | Reservas activas con la firma estimada en los próximos 30 días, incluidas las vencidas                                                      | Ver la reserva                                                                                | `reservations:read` y `properties:read`                                   |
| Avisos con problemas    | Publicaciones pausadas o con error en los portales, primero las que fallaron, con el motivo                                                 | Corregir el aviso (pestaña Difusión de la ficha)                                              | `portals:publish` o `portals:manage`, con la función de portales prendida |

**Estado actual** (`/?vista=estado`):

- Contadores: clientes con al menos una oportunidad abierta (ni ganada ni perdida), propiedades disponibles y emprendimientos en comercialización.
- Oportunidades abiertas por canal de origen, con su porcentaje, y por estado (los estados editables activos de las categorías abiertas, en su orden). En Tokko el contacto _es_ la oportunidad; acá están separados, así que se cuentan oportunidades.
- Propiedades por estado (sin las de la papelera).
- Listados paginados (10 por página, cada uno con su param en la URL) de propiedades disponibles (código, título, tipo y barrio, precio por operación y captador) y de emprendimientos en comercialización (con sus unidades disponibles).

Cada bloque aparece solo con el permiso de su módulo. **No se construye**: la pestaña Performance (va con Reportes) y los widgets de eventos, tareas y visitas autogestionadas. Los vencimientos de contratos de alquiler se suman con `rentals`.

### 7.0.1 Noticias (#16)

El feed de actividad de la empresa (`/noticias`, permiso `news:read`). Se lee del historial (`audit_log`): ningún módulo escribe noticias aparte. El módulo `audit` decide qué entradas son noticia y de qué tipo (`newsKindOf`):

| Tipo                  | Entradas del historial                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Contactos nuevos      | Alta del contacto, también la que registra el agente de IA o la web                              |
| Contactos reasignados | Reasignación de agente, con el agente nuevo                                                      |
| Contactos borrados    | Baja a la papelera                                                                               |
| Nuevas propiedades    | Alta, también la que sale de una tasación                                                        |
| Cambios de estado     | Cambio de estado, con el anterior                                                                |
| Cambios de operación  | Edición que cambia las operaciones ofrecidas (venta, alquiler…), aunque también cambie un precio |
| Cambios de precio     | Edición que cambia un precio o su moneda, con el anterior (sube o baja)                          |
| Reservas              | Reserva, reserva caída y reserva firmada                                                         |

- **Tarjetas**: una por propiedad o contacto y por día (en Buenos Aires), ordenadas por su novedad más reciente. Muestran la entidad como está hoy (estado, código, tipo, barrio y operaciones; nombre y etiquetas), la última novedad con su autor y hora, y las demás plegadas ("N actualizaciones más"). Cada tarjeta trae hasta 20 novedades; las demás se ven en el historial de la ficha.
- **Scroll infinito**, paginado por tarjetas en la base (15 por tanda).
- **Tipos**: el selector "Mostrando N tipos de noticias" se guarda por usuario en una cookie.
- **Alcance**: lo define "Noticias" en Mi empresa → General. Con "Sucursal", cada usuario ve las propiedades y contactos de su sucursal; un usuario sin sucursal ve todo. Las reglas de lectura de propiedades y contactos no se aplican al feed: se ve la novedad aunque no se pueda abrir la ficha.
- Los avisos a cada usuario (lo que le asignan) van en la campana de la barra (§9, #112).

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
- **Buscador de la barra superior**: busca contactos, propiedades, emprendimientos y agentes desde cualquier pantalla (también con Ctrl+K).
  - Los íconos a la derecha del input eligen dónde buscar; se pueden marcar varios. Sin ninguno marcado busca en todos. La elección se recuerda en una cookie del navegador.
  - Desde dos letras, despliega los primeros 5 resultados de cada tipo, agrupados, con un link "Ver los N" al listado del módulo filtrado por el texto. Las flechas recorren los resultados y Enter abre la ficha (un agente abre su panel en Usuarios).
  - Reusa el listado de cada módulo (caso de uso `GlobalSearch` en `reporting`): cada uno aplica sus permisos y su alcance (un agente ve sus contactos). Un tipo que el usuario no puede ver no aparece; los agentes requieren `users:read`.
  - En mobile, un botón de lupa abre el buscador arriba de la pantalla.
- **Notificaciones** (la campana de la barra superior, ADR 0040 y 0043), en dos pestañas: "Avisos", lo que le toca a quien entra, y "Procesos", lo que corre en los jobs. El número de la campana suma los avisos sin leer y los procesos en curso; cada pestaña muestra el suyo. Al abrirla va a "Avisos", salvo que no haya avisos sin leer y sí procesos en curso.
- **Avisos** (#112): solo dentro del panel; ni email ni WhatsApp.
  - Hoy avisan las asignaciones: "Te asignaron el contacto…", "…una oportunidad de…" y "…una consulta de…", con el nombre de hoy del contacto. Cada aviso lleva a la ficha del contacto (las oportunidades y las consultas, a su pestaña Oportunidades).
  - No se avisa a quien se asigna algo a sí mismo ni cuando solo cambia la sucursal. Una consulta asignada se anuncia una vez, como consulta, aunque también le cambie el agente al contacto y a la oportunidad.
  - Abrir un aviso lo marca leído; "Marcar todos como leídos" marca los demás. De a 10, con "Ver más" hasta 50. Con la campana cerrada, las no leídas se vuelven a contar cada minuto.
  - Un contacto suprimido se lleva sus avisos; los de un duplicado unificado pasan al contacto que queda.
  - Pendiente (#112): las preferencias por tipo con un interruptor general, y el resto del catálogo (productor y tasador asignados, cambios en contactos y propiedades, unificaciones, búsquedas con coincidencias nuevas, borrados y restauraciones, reservas por vencer, interacción del cliente con las fichas, importaciones).
- **Procesos** (ADR 0040): los procesos que corren en los jobs, para saber qué se está procesando y cuándo termina.
  - Muestra las fotos y planos procesándose (agrupados por ficha y por quien los subió; las que trajo una importación de Tokko, en una sola tarea "Fotos de la importación de Tokko" a nombre de quien la pidió, que sigue en curso después de que la importación termina), las importaciones (contactos, propiedades por planilla o por la API de Tokko, unidades y usuarios de Tokko), las acciones masivas de oportunidades, los PDF de la ficha y de una selección del buscador y, para quien ve todos, las publicaciones en los portales.
  - Cada uno con su estado (En espera, Procesando, Listo, Con error; las fotos dicen "Generando variantes"), su avance si se conoce ("1.200 de 2.780", con barra), las filas con problemas o el motivo del error, y un link: el reporte de la importación, la pestaña Multimedia o Difusión de la ficha, la descarga del PDF, Usuarios o el pipeline.
  - El número de la campana cuenta los que siguen en curso. Mientras hay alguno, vuelve a preguntar cada 15 segundos (cada 5 con el panel abierto); sin nada en curso no pregunta.
  - Cada usuario ve lo que pidió. Con el permiso `background-tasks:read-others` (el administrador lo tiene) aparece "Míos / Todos": lo de los demás, lo del sistema y los portales.
  - Los terminados se muestran una semana o hasta "Limpiar terminados" (se recuerda en una cookie del navegador). De a 10, con "Ver más" hasta 50.
  - Las exportaciones no aparecen: se arman en la misma descarga, no en un job.
- **Sin API interna**: el sitio web, el agente de IA y los jobs llaman a los **mismos casos de uso** de `@norde/core`, contra la misma base (ver [arquitectura.md](../arquitectura.md)).
- **Archivos**: fotos, planos y PDFs en Cloudflare R2 (S3 compatible, ADR 0018), con thumbnails optimizados. El bucket es privado: el panel sirve cada archivo después de autorizarlo.
- **Notificaciones**: los avisos a cada usuario viven en la campana del panel (módulo `notifications`, ADR 0043). Los avisos por mail o WhatsApp a usuarios del panel no se construyen (#112).
- **Tareas programadas**: cálculo de IPC, avisos de vencimiento, sincronización con portales y cruce de oportunidades. Corren como jobs de pg-boss en el proceso `apps/gestion` (ADR 0021).
- **Backups** diarios de la base de datos.

---

## 10. Stack y arquitectura

El stack, la estructura del monorepo, las capas y las reglas están en **[docs/arquitectura.md](../arquitectura.md)**.

Resumen de lo que aplica a este módulo:

- **`apps/gestion`** (Next.js 16) es **solo presentación**: pantallas, Server Actions delgadas y login (Better Auth).
- Toda la lógica de este documento (clientes, oportunidades, propiedades, alquileres, IPC, tasaciones, reportes) vive en **`@norde/core`**, organizada por módulo. La usan también el agente de IA y la web.
- El relay del outbox y los jobs (IPC, vencimientos, portales, alertas) corren en el mismo proceso de **`apps/gestion`**, arrancados desde `instrumentation.ts` (ADR 0021). Dónde entran los webhooks de portales se define en #14.
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
3. **Comisiones**: ✅ Definido. La reserva registra la comisión en porcentaje y/o monto (§4.9); los reportes se definen al final.
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

Decidido el 02/10/2026 (#50), porque Norde no las usa ni las configuró en Tokko:

- **No se construyen**: importar listas de propiedades (la función de Tokko; la migración de la cartera desde la exportación de Tokko sí, §4.10), la configuración de Reservas (gerentes de reservas, etiqueta obligatoria para reservar y notificaciones propias; el módulo sigue en #13), la supervisión de propiedades (administradores de cartera), la validación legal o tributaria antes de publicar en portales, un proveedor de email propio (SMTP; los emails salen por Resend), la ficha y el PDF en inglés, y las búsquedas similares automáticas para consultas web.
- **Construidas pero ocultas**, cada una con su variable de entorno apagada por defecto en `apps/gestion`: marca de agua, códigos de referencia por tipo, usuario, equipo o sucursal, equipos y atributos personalizados (§3, §14).
- **Se mantienen**: Roles, aunque hoy hay un solo grupo, y la importación de contactos desde Excel (#8).

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

"Mi empresa" se despliega en el sidebar con cinco grupos, y cada grupo muestra sus secciones como pestañas (un grupo de una sola sección no lleva pestañas). Cada grupo lleva a su primera sección, que nunca es una de las ocultas por flag. La config vive en `apps/gestion/src/features/shell/company-navigation.ts`.

| Grupo       | Secciones                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| General     | Datos (`/general`), Email, Marca de agua\*, Códigos\*                     |
| Publicación | Portales, Ficha y PDF                                                     |
| Catálogos   | Propiedades, Ubicaciones, Servicios y ambientes, Etiquetas, Oportunidades |
| Equipo      | Usuarios, Roles, Sucursales, Equipos\*                                    |
| Archivos    | Archivos                                                                  |

\* Ocultas por flag (#50).

| Sección (`/mi-empresa/…`) | Qué guarda                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General                   | Nombre, logo (si está cargado, reemplaza al isotipo de Norde en el sidebar y lo ve cualquier usuario), zona horaria (por defecto `America/Argentina/Buenos_Aires`), alcance de Noticias. También guarda la URL de propiedades y de emprendimientos en la web (con `{id}` o `{slug}`), pero por ahora no se edita desde el panel                                                                                       |
| Marca de agua             | Logo, tamaño (5 % a 50 % del ancho), posición (9), opacidad. Se aplica a las fotos de portales y PDF; hay vista previa sobre una foto de muestra, sin guardar                                                                                                                                                                                                                                                         |
| Portales                  | Pie de la descripción con variables: `{codigo}`, `{telefono_sucursal}`, `{email_sucursal}`, `{whatsapp_sucursal}`, `{url_web}`. Otra variable es un error                                                                                                                                                                                                                                                             |
| Email                     | Nombre del remitente y dirección de respuesta. La dirección de envío y la API key de Resend van por entorno. Botón de email de prueba (queda en el historial)                                                                                                                                                                                                                                                         |
| Códigos                   | Prefijos por tipo de propiedad y exclusivos por usuario, equipo o sucursal                                                                                                                                                                                                                                                                                                                                            |
| Ficha y PDF               | Contacto de la empresa (con un texto libre de hasta 6 renglones que reemplaza a los datos de la sucursal, salvo que la sucursal tenga el suyo), datos del agente (mostrar, no mostrar o preguntar al armar el PDF), precio, dirección al enviar y al descargar (exacta, aproximada u oculta), fotos del emprendimiento en las unidades, color de marca de todos los PDF (con contraste de al menos 3:1 con el blanco) |
| Archivos                  | Gestor de archivos de la empresa                                                                                                                                                                                                                                                                                                                                                                                      |

> **Ocultas (#50).** Marca de agua (`WATERMARK_ENABLED`) y Códigos (`REFERENCE_CODES_ENABLED`): Norde tiene la marca de agua deshabilitada y usa solo el prefijo general. Apagadas (por defecto), la pestaña no se muestra y su ruta responde 404. Sin la pantalla de Códigos, toda alta recibe el prefijo general.

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

---

## 15. Caja chica (#164)

Reemplaza a `norde-caja`, la app aparte con la que la oficina lleva el efectivo. Módulo `cash`. La etapa 1 deja el dominio, la base y los permisos; la pantalla (`/caja`) llega en la etapa 2.

### 15.1 Cajas y movimientos

- Dos cajas fijas e independientes: **Caja de oficina** y **Caja Osvaldo**. Cada una tiene sus movimientos, saldos y cierres. Agregar una es un cambio de código.
- Un movimiento es un **ingreso** o un **egreso** en pesos, con fecha (día de Buenos Aires, no futura), concepto (obligatorio, hasta 255 caracteres) y observaciones (hasta 500). El monto se escribe como en la planilla: `125000`, `125.000` o `125.000,50`.
- La caja se ve por **mes calendario**. El saldo inicial de un mes es el acumulado de todos los meses anteriores; la planilla muestra el saldo después de cada movimiento, en orden de fecha y de carga.

### 15.2 Qué se puede hacer en cada mes

| Acción                                  | Mes vigente   | Mes cerrado                          |
| --------------------------------------- | ------------- | ------------------------------------ |
| Cargar                                  | `cash:create` | `cash:create` + `cash:manage-closed` |
| Editar (también cambiarlo de mes)       | `cash:update` | `cash:update` + `cash:manage-closed` |
| Anular el **último** movimiento cargado | `cash:void`   | `cash:void` + `cash:manage-closed`   |
| Borrar cualquier movimiento             | `cash:delete` | `cash:delete`                        |

- Al editar se controlan el mes de antes y el de después: quien no tiene `cash:manage-closed` no puede llevar un movimiento a un mes cerrado.
- Si alguien cargó otro movimiento mientras tanto, anular falla: no se anula algo distinto de lo que se confirmó.
- Anular y borrar no eliminan la fila: el movimiento queda inactivo, deja de sumar y figura en su historial.

### 15.3 Cierre mensual

- Un mes anterior al vigente está **cerrado**. La primera vez que alguien abre la caja en el mes nuevo, se guarda el cierre de los meses que falten, en orden: saldo inicial, ingresos, egresos y saldo final. Cada mes se cierra una sola vez aunque entren dos personas a la vez.
- Si se carga, edita, anula o borra algo de un mes cerrado, se recalculan ese cierre y los siguientes de la misma caja.
- Los cierres quedan seguidos, del primer mes con movimientos al anterior al vigente.

### 15.4 Rol Control de caja y permisos

- Rol de sistema **Control de caja** (`cash-control`): `cash:read`, `cash:create`, `cash:update`, `cash:void` y `cash:export`. El Administrador tiene `cash:*`. Se ajusta desde el ABM de roles.
- `cash:audit` (ver el log de la caja) y `cash:export` (Excel) se usan en la etapa 3.
- Quien solo tiene permisos de caja entra directo a la caja, sin el menú del panel; quien tiene caja y otros permisos ve "Caja" en el menú (etapa 2).

### 15.5 Historial

- Cada movimiento registra su alta, sus ediciones (solo los campos que cambiaron) y su anulación o borrado en `audit_log` (`cash_movement.recorded`, `.updated`, `.voided`, `.deleted`). Cada cierre registra su alta y sus recálculos (`cash_closing.closed`, `.recalculated`). No aparecen en Noticias.
- La caja no emite eventos de dominio: ningún otro módulo reacciona a sus cambios.

### 15.6 Diferencias con `norde-caja`

- Montos en centavos, sin decimales de punto flotante.
- Los usuarios son los del panel: el rol ADMIN / USUARIO de `norde-caja` pasa a ser permisos `cash:*`.
- El log propio se reemplaza por `audit_log`.
- Arranca vacío. Cuando salga a producción se importa una copia de la base MySQL de `norde-caja` (issue aparte).
