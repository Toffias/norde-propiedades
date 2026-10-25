# ADR 0043: Avisos a cada usuario en la campana del panel

- **Estado**: aceptada
- **Fecha**: 2026-10-25
- **Relacionada con**: ADR 0021 (jobs en `apps/gestion`), ADR 0040 (procesos en segundo plano en la barra), issue #112.

## Contexto

La issue #112 pide que cada usuario del panel se entere de lo que le toca y elija de qué. El usuario la recortó (2026-10-25): **solo dentro del panel**, en la campana de la barra superior. Email, WhatsApp y cualquier otro canal externo quedan afuera.

La campana ya mostraba los procesos en segundo plano (ADR 0040). Las tablas `notifications` y `notification_preferences` existían desde la migración `0001`, pero nada las usaba, y `notifications` guardaba el texto (`title`, `body`, `link`).

Se construye en tres etapas: (1) el módulo, la campana y las asignaciones; (2) las preferencias por tipo con un interruptor general; (3) el resto del catálogo.

## Decisión

- **Módulo `notifications`** en el core. Las notificaciones las crean reacciones a eventos de dominio (outbox + pg-boss, en `apps/gestion`), nunca llamadas desde otro caso de uso.
- **La misma campana, dos pestañas** (pedido del usuario): "Avisos" (lo que le toca a quien entra) y "Procesos" (ADR 0040). El número de la campana suma los avisos sin leer y los procesos en curso; cada pestaña muestra el suyo. Al abrir, va a "Avisos", salvo que no haya avisos sin leer y sí procesos en curso.
- **Se guardan el tipo y los IDs, no el texto.** La campana arma "Te asignaron una consulta de Ana Pérez" con el nombre de hoy del contacto, leído de clients como las Noticias. `title`, `body` y `link` quedan sin uso (la `0042` saca el `not null` de `title`; se retiran en otra migración). Cada notificación guarda en `client_ids` los clientes de los que habla: el primero es el de la ficha a la que lleva.
- **Idempotencia** por (`source_event_id`, `user_id`), con el índice único que ya existía: el mismo evento le avisa una vez a cada usuario aunque el job se reintente.
- **No se audita** (decidido con el usuario, 2026-10-25). La regla de `CLAUDE.md` pide auditar todo command que modifica datos, pero una notificación es el buzón personal de cada usuario, no una entidad del negocio: no tiene ficha ni historial, y cada aviso creado o leído sería una fila de `audit_log` que nadie consulta. Tampoco lleva `created_by` ni `updated_by`: la crea siempre el sistema y solo la lee quien la recibe.
- **Supresión y unificación**: las notificaciones de un cliente suprimido se borran (`clients.client_erased`); las de un duplicado unificado pasan al contacto que queda (`clients.clients_merged`).
- **Refresco**: el layout cuenta las no leídas de quien entra. Con la campana cerrada se vuelve a contar cada 60 segundos, con un `count` sobre un índice. Al abrir un aviso queda leído; también se pueden marcar todos.

### Etapa 1: asignaciones

- Se avisa cuando a un usuario le asignan **un contacto, una oportunidad o una consulta**. Las asignaciones de productor y tasador pasan a la etapa 3: hoy no emiten ningún evento.
- Clients emite `clients.client_reassigned` (nuevo) y suma `assignedBy` (y la consulta que la provocó, `inquiryId`) a `clients.opportunity_reassigned` y `clients.inquiry_assigned`. Los eventos anteriores no los traen.
- **Reglas** (`assignmentRecipient`, en el dominio):
  - Sin agente nuevo, o con el mismo de antes (cambió solo la sucursal), no se avisa.
  - Quien se asigna algo a sí mismo no recibe aviso.
  - **Una consulta asignada se anuncia una vez**, como consulta. Al asignarla, el contacto y la oportunidad también pueden cambiar de agente: esas reasignaciones llevan el `inquiryId` y no avisan aparte.
- Una reasignación masiva de oportunidades avisa una vez por oportunidad. Corre con el actor de quien la pidió, así que no le avisa a quien se las asigna a sí mismo.

## Consecuencias

- Un tipo nuevo de aviso es: una reacción a un evento en `notifications`, su valor en `NOTIFICATION_TYPES` (dominio y contract), su texto y su enlace en la campana (`features/shell/notifications.ts`).
- Si el evento no dice quién hizo el cambio, el aviso puede llegarle a quien lo hizo. Los eventos nuevos que disparen avisos tienen que traer quién actuó.
- Una notificación cuyo contacto ya no existe sigue en la lista, sin enlace ("un contacto que ya no existe"). La supresión sí la borra.
- Los avisos no se borran solos. Si la tabla crece demasiado, una limpieza de los leídos viejos es un job aparte.
