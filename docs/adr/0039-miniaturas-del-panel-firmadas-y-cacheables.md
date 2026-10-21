# ADR 0039: Miniaturas del panel firmadas en el listado y cacheables

- **Estado**: aceptada
- **Fecha**: 2026-10-21
- **Modifica**: ADR 0020 (descargas autorizadas por el panel, con URL firmada), solo para las fotos.

## Contexto

Con las 164 propiedades y las 2.780 fotos traídas de Tokko (#17), la grilla de propiedades tarda en mostrar las miniaturas. Cada miniatura hacía este camino:

1. El navegador pide `/propiedades/<id>/fotos/<mediaId>?v=thumbnail` al panel.
2. El panel resuelve la sesión y el caso de uso busca la foto en la base y autoriza.
3. El panel firma una URL de 5 minutos y redirige con `Cache-Control: no-store`.
4. El navegador baja la foto del bucket.

Una página de 24 propiedades eran 24 pedidos al panel, cada uno con su sesión y su consulta. La redirección no se cacheaba y la URL firmada cambiaba en cada pedido, así que el navegador volvía a bajar todas las fotos cada vez que se abría la grilla. Las variantes tampoco tenían `Cache-Control` en el bucket.

## Decisión

- **El listado firma las portadas.** `ListPanelProperties` y `ListDevelopments` reciben el storage. La consulta SQL devuelve la clave de la miniatura de cada portada, o la de la original mientras se genera. El caso de uso la firma y la entrega en `PropertyCover.url`. La clave del storage no sale del caso de uso (`toCover`). Firmar es local, sin llamar al bucket. La grilla carga las miniaturas directo del bucket, sin pedidos al panel.
- **Las URLs de las fotos son reusables.** Se firman por 2 horas con la fecha del comienzo de una ventana de 1 hora (`SignedUrlOptions.reusable`). Durante esa hora la URL es la misma, así que el navegador reusa la foto que ya bajó, y la URL sigue vigente al menos otra hora.
- **La redirección de la ruta de fotos se cachea** 50 minutos (`private, max-age=3000`), menos de lo que sigue vigente la URL. La usan las pantallas que no traen la URL firmada: la galería, la ficha, la bandeja, Inicio y Noticias. Las descargas de archivos y PDF siguen con `no-store` y 1 minuto.
- **Las variantes se suben inmutables** (`PutOptions.immutable`): `Cache-Control: private, max-age=31536000, immutable`. Cada generación usa claves nuevas (ADR 0020), así que el contenido de una clave nunca cambia.
- **Con el disco local nada cambia.** El disco no firma URLs: la portada no trae `url` y la pantalla usa la ruta del panel.

## Consecuencias

- La primera carga de la grilla no hace pedidos al panel por foto, y las siguientes, dentro de la hora, salen de la caché del navegador.
- Una URL firmada de una foto vale hasta 2 horas, en lugar de 5 minutos. Sigue siendo privada: solo la recibe quien puede leer el listado. Quien pierde el permiso puede seguir viendo, por ese rato, las fotos que ya recibió.
- Las variantes generadas antes de este cambio no tienen `Cache-Control` en el bucket. El navegador las cachea igual por la URL reusable, aunque sin `immutable`.
- Las otras pantallas con portadas (Inicio, Noticias, bandeja, actividad de clientes) siguen pidiendo a la ruta del panel, ahora con la redirección cacheada. Si hace falta, se firman igual que el listado.
