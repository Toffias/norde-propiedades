# ADR 0018: Archivos en un storage S3 compatible y emails con Resend

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

Mi empresa (#4) es lo primero que guarda archivos (logo, logo de la marca de agua, gestor de archivos de la empresa) y que manda emails (la prueba de envío). `docs/arquitectura.md` §3.2 dejaba abiertos el storage ("S3 / R2") y el mail ("Resend, Postmark o Brevo"). Los portales, el PDF y las fotos de propiedades van a usar las mismas piezas.

## Decisión

- **Puerto `FileStorage`** en `settings` (`put`, `get`, `delete` con bytes en `Uint8Array`: el core no tiene tipos de Node). Dos adaptadores en `@norde/infra`, elegidos por `STORAGE_DRIVER`:
  - `S3FileStorage` (`@aws-sdk/client-s3`): sirve para Cloudflare R2 (con `S3_ENDPOINT`) y para AWS S3. Es el de producción.
  - `LocalFileStorage`: disco, para desarrollo y tests (`STORAGE_LOCAL_DIR`, por defecto `.storage`, ignorada por git).
- **El bucket es privado.** Los archivos los sirve el panel por rutas que pasan por un caso de uso (`/mi-empresa/logo/[which]`, `/mi-empresa/archivos/[fileId]/descargar`), que decide quién los ve.
- **Las claves las genera el sistema** (`company-files/<uuid>`, `settings/logo/<uuid>`), nunca el nombre que sube el usuario. El adaptador local rechaza cualquier clave que no cumpla ese formato (path traversal).
- **Puerto `Mailer`** con `ResendMailer`: `fetch` contra la API HTTP, sin SDK, timeout de 15 s y un solo intento (reintentar un envío que quizás llegó lo duplicaría). Los errores vuelven como `MailNotConfigured`, `MailRejected` o `MailUnavailable`.
- **Credenciales por entorno**, nunca en la base: `S3_*`, `RESEND_API_KEY` y `MAIL_FROM_ADDRESS` (una dirección de un dominio verificado en Resend). En la base solo quedan el nombre del remitente y la dirección de respuesta.
- **Marca de agua con sharp** (`SharpImageWatermarker`, puerto `ImageWatermarker`). La ubicación y la escala del logo las calcula el dominio (`Watermark.placement`). El adaptador solo compone la imagen.

## Consecuencias

- Las subidas pasan por Server Actions. `next.config.ts` sube `serverActions.bodySizeLimit` y `proxyClientMaxBodySize` a 26 MB (archivos de hasta 25 MB). Si hacen falta archivos más grandes, se pasa a URLs firmadas de subida directa al bucket, sin cambiar el puerto.
- Los logos reemplazados no se borran del storage: el historial de cambios sigue apuntando a su clave.
- Cambiar de proveedor de storage o de email es un adaptador nuevo en `@norde/infra` y una línea en `container.ts`. El core no cambia.
- Antes de producción hay que crear el bucket de R2 y verificar el dominio en Resend.
