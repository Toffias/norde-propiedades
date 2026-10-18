# ADR 0036: Estadísticas de los avisos de MercadoLibre

- **Estado**: aceptada
- **Fecha**: 2026-10-18
- **Complementa**: ADR 0024 (publicación en MercadoLibre) y ADR 0031 (cupo de los paquetes).

## Contexto

El equipo quiere ver, en la pestaña Difusión, cómo le va a cada aviso de MercadoLibre: cuánta gente lo vio y cuántos contactaron. La guía "Estadísticas de interacciones en Inmuebles" de ML da, por aviso:

- Las visitas de toda su vida (`/visits/items?ids=`).
- Las visitas en un rango de fechas (`/items/visits?ids=&date_from=&date_to=`).
- Las preguntas, las veces que vieron el teléfono y las que fueron al WhatsApp en un rango (`/items/{id}/contacts/questions|phone_views|whatsapp`).

Son cantidades: quién contactó ya entra por la bandeja de consultas (ADR 0032).

## Decisión

- **Se leen de MercadoLibre en el momento** y no se guardan, como el cupo de los paquetes. No hace falta un job ni una tabla, y el número es el mismo que muestra ML.
- **`GetListingStats`** (core, query) recibe una publicación y devuelve las visitas desde que se publicó, más las visitas, preguntas, vistas del teléfono y WhatsApp de los **últimos 30 días** (`LISTING_STATS_DAYS`).
  - La ve quien ve la pestaña Difusión (`portals:publish` o `portals:manage`).
  - Si el portal no las da (flag `stats` del catálogo, solo en MercadoLibre) o la publicación todavía no tiene aviso, devuelve `ListingStatsNotAvailable`.
- **`PortalListingStatsReader`** es un puerto nuevo. Lo implementa `MercadoLibreAccountReader` con cinco lecturas por aviso. La fecha de corte la da el `Clock` del core, y el rango lo arma el adaptador.
- **En la pestaña Difusión** de la propiedad y del emprendimiento, cada aviso de ML que ya llegó al portal muestra:
  - "Últimos 30 días: 120 visitas · 3 preguntas · 5 vieron el teléfono · 8 fueron al WhatsApp";
  - "950 visitas desde que se publicó".
  - Se leen en paralelo con los planes de Zonaprop. Si ML no responde, la fila muestra el motivo y la pestaña sigue funcionando.

## Consecuencias

- Abrir Difusión hace cinco lecturas a ML por aviso (una propiedad tiene uno o dos; un emprendimiento, uno). Si se vuelve lento, se pueden cargar aparte con `Suspense`.
- Los avisos dados de baja que tienen ID en ML también muestran sus números: sirven para comparar.
- No hay historial ni reportes de estadísticas. Si hicieran falta, habría que guardarlas con un job (otro ADR).
- Las cotizaciones de un emprendimiento no tienen un contador por aviso en esta API: se ven en la bandeja.
