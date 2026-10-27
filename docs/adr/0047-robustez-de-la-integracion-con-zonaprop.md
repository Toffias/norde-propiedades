# ADR 0047: Robustez de la integración con Zonaprop

- **Estado**: aceptada
- **Fecha**: 2026-10-26
- **Modifica**: ADR 0027 (publicación), ADR 0029 (consultas, "sin cursor") y el catálogo de portales (`reconciles` de Zonaprop).
- **Complementa**: la auditoría de MercadoLibre (#163), que resolvió en paralelo varios hallazgos compartidos.

## Contexto

La auditoría de la integración (#162) encontró avisos que quedaban online cuando no tenían que estar, consultas que se perdían y cambios de Zonaprop que el panel nunca veía. Nunca hubo una consulta real ni un emprendimiento online de punta a punta, así que varias decisiones se tomaron con la documentación de Open Navent.

La auditoría de MercadoLibre (#163) llegó antes a `dev` con soluciones generales para varios de estos hallazgos. Este ADR las toma y suma lo propio de Zonaprop:

- **Pausar con contenido inválido o sin precio** (bugs 1 y 13): `SyncListing` pausa el aviso sin mandar el contenido y deja el motivo (`#pauseStale`). Vuelve solo cuando se corrige.
- **Consulta con un teléfono o un email inválido** (bug 3): `inquiryContact` en el dominio de `clients`.
- **Cambios del pie para portales, del link de la web o de una sucursal** (caso 12): `identity.branch_updated` y `RequestAllListingsSync`.
- **Reintento de las publicaciones en error porque el portal no respondió** (caso 6): lo hace la conciliación diaria.

## Decisión

**Publicación**

- **Reactivar revisa créditos** del plan, como publicar y cambiar de plan.
- **Fotos de una unidad**: el evento de media no trae el emprendimiento. La suscripción lo busca (`GetPropertySummaries`) y reenvía el aviso del emprendimiento.
- El `PUT` de un emprendimiento tiene 120 segundos de timeout (el resto, 15).

**Conciliación**

- Zonaprop pasa a `reconciles: true`. `ZonapropListingStates` lee `GET /v1/inmobiliarias/{codigo}/avisos/{codigoAviso}/status` de a cinco:
  - `ONLINE` es activo.
  - `OFFLINE` es pausado, con el motivo. Zonaprop no da de baja para siempre: el aviso vuelve con otro envío.
  - `EN_ESPERA`, otro estado o un 404 (por ejemplo, un emprendimiento) quedan como estaban.
- El estado trae `idAvisoNavplat`: la conciliación guarda el link de los avisos que no lo tenían.
- Una publicación que Norde ya pausó (el equipo, una reserva, sin precio) queda como está aunque el portal la informe offline: así no se pierde el motivo de Norde. Si el portal reactiva una pausada, se pide sincronizar: si la propiedad sigue reservada o sin precio, se vuelve a pausar.

**Consultas**

- **Cursor**: `portal_accounts.leads_pulled_at` guarda cuándo empezó la última lectura completa. La próxima lee desde ahí: como mínimo los últimos 2 días, como máximo 14. Una lectura cortada por el tope de páginas o por un error no lo mueve. Es estado técnico del job: no se audita, como `last_synced_at` de las publicaciones. Conectar otra cuenta del portal lo pone en cero.
- Los rechazos se loguean con el ID del portal y el motivo, sin datos del contacto.
- **Avisos de Tokko sin vincular**: si el código del aviso no es de Norde, el adaptador lee la clave interna del resumen de avisos online por `idAvisoNavplat`, recordada en memoria. La consulta queda con la propiedad de ese código, o la del último tramo en las unidades de Tokko.
- Los códigos de aviso y de unidad de Norde se comparan sin distinguir mayúsculas.
- Una `fecha` sin offset se lee como hora de Buenos Aires (UTC-3).

## Consecuencias

- Migración solo de expansión: `0047` (columna `leads_pulled_at`, nula).
- La conciliación diaria hace una llamada por aviso de Zonaprop. Con cientos de avisos, son unos minutos a las 6:00.
- La ficha lee los créditos con un cache de 2 minutos (`CachedPortalCredits`, solo para mostrar): abrir Difusión seguido no llama a Zonaprop cada vez. Publicar, reactivar y cambiar de plan leen en vivo.
- **No se reintenta sola** una publicación que falló al crearse por falta de créditos (`ERR-0502`): se vuelve a intentar cuando cambia la propiedad o con "Sincronizar".
- Queda por verificar con datos reales:
  - la forma de `vencimientos` en `disponibilidad` (sin documentar; no se muestra todavía);
  - el `status` de un emprendimiento;
  - el cambio de plan sobre un aviso online;
  - `publicacion` en cada unidad.
