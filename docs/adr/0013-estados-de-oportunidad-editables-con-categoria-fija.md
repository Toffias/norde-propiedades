# ADR 0013: Los estados de oportunidad son editables y cada uno pertenece a una categoría fija del dominio

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

En Tokko cada inmobiliaria arma sus propios estados de oportunidad: nombre, color y orden (#9). Hoy `opportunities.status` es un valor fijo del dominio (`new`, `contacted`, `visiting`, `negotiating`, `won`, `lost`, `referred_to_partner`). Las reglas automáticas, el embudo y los reportes dependen de esos valores.

Si los estados fueran texto libre, ninguna regla de dominio podría preguntar "¿está ganada?" sin depender de un nombre que alguien puede cambiar.

## Decisión

- Nueva tabla `opportunity_stages` con los estados que edita Norde: `name`, `color`, `position`, `is_active` y `category`.
- `category` es un `OpportunityStatus`, el mismo valor fijo que ya existe. Cada estado editable pertenece a una sola categoría, y una categoría puede tener varios estados (por ejemplo, "Visita agendada" y "Visitó" son `visiting`).
- La oportunidad guarda las dos cosas: `stage_id` (lo que ve el usuario) y `status` (la categoría, desnormalizada). El dominio mantiene `status` igual a la categoría del estado en cada cambio.
- **Las reglas y los reportes usan solo la categoría.** El estado editable es presentación y orden del kanban.
- La configuración de las reglas automáticas (`opportunity_settings`) referencia estados concretos (`stage_on_create_id`, etc.).
- Un estado en uso no se borra: se desactiva (`is_active = false`).

## Consecuencias

- Norde puede renombrar, recolorear y reordenar sus estados sin migraciones ni deploy.
- El agente de IA y la web siguen leyendo `status` sin cambios: la columna `stage_id` es nullable hasta el backfill.
- Agregar una **categoría** nueva sigue siendo un cambio de código y de dominio, a propósito.
- El cambio de estado se registra en `opportunity_status_changes` con estado y categoría, de origen y de destino, para medir vigencia y tiempo de conversión.

## Nota de implementación (#9, etapa 1)

- **Transiciones**: entre estados de la misma categoría el paso es libre. Entre categorías valen las transiciones del dominio (`checkTransition`).
- **Cierre**: a ganada o perdida solo se llega cerrando con un motivo, y la calificación del motivo decide cuál de las dos.
- **Catálogo**: la categoría de un estado no cambia después de crearlo, y cada categoría conserva al menos un estado activo.
