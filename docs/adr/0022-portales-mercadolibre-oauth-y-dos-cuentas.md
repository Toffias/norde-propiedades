# ADR 0022: Portales: MercadoLibre por OAuth, con dos cuentas y tokens cifrados en la base

- **Estado**: aceptada
- **Fecha**: 2026-10-05
- **Complementa**: ADR 0018 (los secretos viven en el entorno) y ADR 0021 (los jobs corren en `apps/gestion`).

## Contexto

La difusión en portales (#14) arranca solo con MercadoLibre: dar de alta, editar y dar de baja una propiedad o un emprendimiento en el panel se replica en ML. La API de ML condiciona el diseño:

- **OAuth con refresh token rotativo.**
  - El acceso es por OAuth (authorization code, con PKCE opcional).
  - El access token dura unas horas.
  - El refresh token es de **un solo uso**: cada refresh devuelve otro, y el anterior deja de servir. Vence a los 6 meses.
  - Los tokens cambian solos, así que no pueden vivir en el `.env`.
- **Emprendimientos.**
  - ML no tiene una API aparte: un emprendimiento es **un aviso** de la categoría "Emprendimientos", con cada unidad como **variación**.
  - Requiere un paquete de desarrollos.
  - La cuenta que lo tiene no puede publicar avisos comunes.
- **Notificaciones sin firma.** Las notificaciones de ML (webhooks) no traen firma: solo se puede filtrar por las IP de origen.
- **Fotos por URL.** Las fotos se publican por URL, y ML las descarga al recibir el aviso. Nuestro bucket es privado (ADR 0018).

## Decisión

- **Dos cuentas de MercadoLibre**, como dos portales del catálogo:
  - `mercadolibre` publica las propiedades.
  - `mercadolibre_developments` publica los emprendimientos con sus unidades.
  - Comparten la app de ML (`MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET` y `MERCADOLIBRE_REDIRECT_URI`).
  - Una misma cuenta de ML no se puede conectar en las dos (regla de `PortalAccount.connect`).
- **Los tokens de OAuth viven en la base, cifrados**: es una excepción al ADR 0018.
  - Columna `portal_accounts.credentials_encrypted`.
  - Cifrado AES-256-GCM, con `versión | IV | tag | texto`, y la clave `PORTALS_SECRET_KEY` del `env.ts` de `apps/gestion`.
  - La clave sí sigue en el entorno. Cambiarla obliga a volver a conectar las cuentas.
  - Los tokens nunca se loguean ni van a la auditoría. El core no los lee: pasan del autorizador (`PortalAuthorizer`) al almacén (`PortalCredentialStore`).
- **Conexión desde Mi empresa → Portales**, con `portals:manage` (permiso nuevo; administrador y gerente lo tienen por `portals:*`):
  - **Ida**: `GET /api/portals/mercadolibre/connect?portal=…` arma `state` y PKCE (S256) y los guarda 10 minutos en una cookie httpOnly limitada a `/api/portals`. Después redirige a ML.
  - **Vuelta**: `GET /api/portals/mercadolibre/callback` (la URL registrada en la app).
    - `ConnectPortalAccount` compara el `state`, canjea el código y lee la cuenta (`/users/me`).
    - Guarda la cuenta y los tokens en una transacción, y audita `portal_account.connected` con la cuenta de ML antes y después.
    - La cookie se borra siempre.
  - **Sin `offline_access`** (no hay refresh token), la conexión se rechaza: la cuenta se caería a las pocas horas.
- **El refresh corre bajo `select … for update`** sobre la fila de la cuenta (etapa 2), para que dos jobs no gasten el mismo refresh token. Si ML responde `invalid_grant`, la cuenta queda para reconectar.
- **Fotos por URL firmada** generada al sincronizar (etapa 2): la variante con marca de agua si Mi empresa la activó, y si no la `web`. La firma dura lo suficiente para que ML las descargue (unas horas). No hay rutas públicas ni bucket público.
- **Sin webhooks de ML por ahora.** Las notificaciones no tienen firma y esta etapa no trae consultas. El estado real de cada aviso (vencidos, pausados por moderación) se concilia con un job diario. Cuando se traigan preguntas y leads, un ADR decide cómo autenticarlos.
- **Detrás de `PORTALS_ENABLED`** (apagado por defecto, exige `PORTALS_SECRET_KEY`). Mientras está apagado, el container no arma el módulo, y el catálogo de Roles y Usuarios no ofrece los permisos de portales.

## Consecuencias

- Hay que crear la app en el DevCenter de ML: el titular validado, la URL de vuelta HTTPS y los permisos `offline_access`, `read` y `write`.
  - En desarrollo local, la vuelta necesita un túnel HTTPS.
  - Se puede probar con un usuario de prueba de ML activado como inmobiliaria.
- Norde necesita **dos cuentas de ML**:
  - Una activada como inmobiliaria, con su paquete de publicaciones.
  - Otra con privilegios y paquete de emprendimientos (se pide a soporte de ML).
- Perder `PORTALS_SECRET_KEY` no pierde datos de negocio: solo hay que volver a conectar las cuentas.
- Desconectar una cuenta borra sus credenciales, pero no toca los avisos que ya están en ML.
