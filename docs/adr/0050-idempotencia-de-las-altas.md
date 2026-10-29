# ADR 0050: Idempotencia de las altas

- **Estado**: aceptada
- **Fecha**: 2026-10-28

## Contexto

Un alta puede llegar dos veces al servidor: doble clic, un reintento de la red o un "Reintentar" después de un error en el que el alta sí se había guardado. Sin protección, eso deja dos contactos, dos notas o dos tasaciones. En el caso de la reserva, el segundo pedido choca con el índice de reserva activa y la persona ve "Algo salió mal", aunque la reserva quedó bien.

Los botones se bloquean y muestran un spinner mientras corre la acción, pero eso no cubre los reintentos de la red ni lo que llega antes de que el botón se deshabilite. Del lado del servidor hace falta que repetir un alta no tenga efecto.

La concurrencia entre personas distintas (dos personas editando lo mismo) no entra acá: Norde trabaja con tres personas en la sucursal, que casi nunca operan a la vez.

## Decisión

- **Clave de idempotencia por formulario.** El formulario de alta genera un UUID al montarse (`useIdempotencyKey`, con `crypto.getRandomValues` para que funcione también sin HTTPS) y lo manda como `idempotencyKey` en el input, igual en cada reintento. Después de un alta que salió bien, la clave se renueva.
- **En el contract**, `idempotencyKey: idempotencyKeySchema.optional()`. Sin clave, el command se comporta como antes (jobs, importaciones, agente).
- **En el caso de uso**, `runIdempotent(tx.idempotency, idempotencyScope(actor.id, '<Command>', key), ResultSchema, work)` **dentro** de `uow.run`:
  - `claim` inserta la clave sin resultado. Si otra transacción con la misma clave está en curso, Postgres espera a que termine.
  - Si la otra terminó bien, devuelve su resultado (validado con el `ResultSchema` del command) y no corre nada.
  - Si el command devuelve un `Err` o lanza, el rollback libera la clave: la persona corrige y reintenta con la misma.
  - Si sale bien, `complete` guarda el resultado en la misma transacción que el alta.
- **Tabla `core.idempotency_keys`** (`actor_id`, `command`, `key`, `result jsonb`, `created_at`), única por las tres primeras. Es técnica: no se audita.
- **`result` guarda solo IDs y valores simples** (código, resultado de la geolocalización), nunca datos personales. Así no hace falta tocarla en la supresión.
- **Altas cubiertas**: `CreateClient`, `AddClientNote`, `CreateProperty`, `CreateDevelopment`, `ReserveProperty`, `CreateAppraisal` y `RecordCashMovement` (la pantalla de caja la manda cuando exista, #164).
- **Fuera de alcance**: `SendListings` (su resultado incluye el link con el token, que no se guarda en claro) y las ediciones, que repetidas dejan el mismo estado.

## Consecuencias

- Un alta nueva desde el panel suma la clave en el contract, `runIdempotent` en el command y `useIdempotencyKey` en el formulario, con su test de reintento.
- Si el primer pedido se guardó pero la respuesta se perdió, y la persona cambia los datos y reintenta con el formulario abierto, recibe el alta ya guardada, no una nueva. Es lo esperable: el formulario pasa a la ficha del alta guardada.
- La tabla crece unas decenas de filas por día. Si hace falta, una limpieza de las claves de más de unos días no cambia el comportamiento.
