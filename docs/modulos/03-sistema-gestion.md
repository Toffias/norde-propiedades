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

### 2.2 Trazabilidad de cambios (auditoría)

- Una tabla `audit_log` registra **quién** hizo el cambio, **cuándo**, **sobre qué** entidad e id, **qué acción** (crear, editar, borrar, exportar, iniciar sesión) y el **antes y después** de los campos cambiados.
- En cada ficha (propiedad, cliente, contrato) hay una pestaña "Historial" con los cambios.
- Las bajas son **lógicas** (soft delete): nada se borra físicamente desde el panel.
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

- Vista de mapa en el panel, con filtros por operación, tipo, estado y precio, y un pin por propiedad.
- La misma API alimenta el mapa del sitio web.
- Proveedor sugerido: **Leaflet + OpenStreetMap** (gratis) o **Google Maps** (mejor geocoding, con costo por uso). Hace falta geocodificar la dirección al cargar la propiedad.

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
- **Archivos**: fotos, planos y PDFs en el servicio en la nube para imágenes (por ejemplo S3, Cloudflare R2 o Cloudinary), con thumbnails optimizados.
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

1. **Migración**: ¿Norde usa hoy algún CRM inmobiliario (Tokko, Xintel, etc.) o planillas? ¿Hay que migrar propiedades y clientes?
2. **Cobranzas de alquileres**: ¿están en alcance?
3. **Comisiones**: ¿se registran en el sistema para los reportes de ventas?
4. **Cuántos usuarios** y roles reales tiene el equipo.
5. **Portales**: ¿Norde ya tiene cuentas activas en Zonaprop y Argenprop? ¿Con qué plan o acceso?
6. **"Oportunidades cross platform"**: ✅ Definido (sección 3.3).
7. **Inmobiliarias socias**: ¿se registran en el sistema, con contacto y zonas? ¿Hay acuerdo de comisión por referido que convenga registrar?
