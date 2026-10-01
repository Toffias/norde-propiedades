# ADR 0020: Multimedia y PDF de la ficha en jobs, con descarga autorizada y URL firmada

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

La ficha de propiedad (#6) sube fotos y arma PDF (la ficha, la hoja de vidriera y el reporte al propietario). Las dos cosas pesan:

- **Fotos**: de cada original salen una miniatura (galería y tarjetas), una versión web (sitio, portales y PDF) y, si Mi empresa la activó, una copia con marca de agua. Con sharp son unos segundos por foto. Hacerlo dentro de la subida haría esperar al usuario o cortaría el pedido por timeout con muchas fotos.
- **PDF**: lleva las fotos (hay que bajarlas del storage) y respeta la configuración de "Ficha y PDF". También tarda unos segundos, y el reporte se manda por email.

El storage es privado (ADR 0018): hasta ahora el panel servía cada archivo pasando los bytes por el servidor.

## Decisión

- **Variantes de fotos y PDF en jobs** de pg-boss, en `apps/agent`, disparados por eventos del outbox:
  - `properties.media_variants_requested` (alta o rotación de una foto) → `GeneratePropertyMediaVariants`.
  - `properties.media_deleted` → `DeleteStoredMediaFiles` borra la original y las variantes del storage después de confirmar el borrado.
  - `properties.document_requested` → `RenderPropertyDocument` arma el PDF con pdf-lib.
- **El estado vive en la base**:
  - `media_items.processing_status` (`pending`, `ready` o `failed`) y `processing_error`.
  - La tabla `property_documents` guarda los PDF pedidos con su estado y su archivo.
  - La pantalla muestra "procesando" o "armándose" y vuelve a preguntar mientras haya algo pendiente.
- **La original nunca se modifica.** Rotar una foto genera variantes nuevas, con claves nuevas, y borra las anteriores.
- **Descargas autorizadas por el panel, con URL firmada.** Cada foto, archivo y PDF se pide a una ruta del panel (`/propiedades/[id]/fotos|archivos|documentos/...`). El caso de uso autoriza el pedido y entrega una de dos cosas:
  - con S3 o R2, una redirección a una URL firmada de corta duración (`FileStorage.signedUrl`): 5 minutos para las fotos y 1 minuto para las descargas, sin que los bytes pasen por el servidor;
  - con el disco local, que no firma URLs, el contenido.
- **Una foto por pedido** al subir: la pantalla sube de a tres en paralelo y muestra el avance de cada una. Además, así cada pedido queda por debajo del límite de 26 MB de las Server Actions.

## Consecuencias

- La subida y el pedido de un PDF responden enseguida; el trabajo pesado no compite con las pantallas del panel.
- Para ver las variantes y los PDF en desarrollo hay que correr `apps/agent` además de `apps/gestion`, con el mismo storage (`STORAGE_LOCAL_DIR=../gestion/.storage`).
- Una foto que sharp no puede leer queda "fallida" con el motivo y sin reintentos. Un error inesperado al armar un PDF lo deja "fallido" y el job lo registra.
- Mientras se generan las variantes, la galería muestra la original (servida por la misma ruta).
- El sitio web (`apps/web`) y los portales todavía no leen estas variantes: lo resuelven #14 y la web, con la misma clave del storage.
