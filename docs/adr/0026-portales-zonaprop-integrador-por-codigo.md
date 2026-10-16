# ADR 0026: Portales: Zonaprop como integrador, con la cuenta conectada por su código

- **Estado**: aceptada
- **Fecha**: 2026-10-16
- **Complementa**: ADR 0018 (los secretos viven en el entorno) y ADR 0022 (portales: MercadoLibre por OAuth).

## Contexto

Zonaprop es el segundo portal de la difusión (#14). Se integra con la API de **Open Navent** (Grupo QuintoAndar), documentada en `open-classifieds.notion.site/arg/rela`. Su modelo es distinto al de MercadoLibre:

- **No hay OAuth por cuenta.**
  - Open Navent le da a Norde credenciales de **integrador** (`client_id` y `client_secret`).
  - Con `POST /v1/application/login?grant_type=client_credentials` se obtiene un bearer token de larga duración, que se puede volver a pedir en cualquier momento.
  - La misma credencial sirve para todas las inmobiliarias que el portal asoció a Norde: en producción, con el botón "Login" de Open Navent o pidiéndolo a soporte.
- **La cuenta se identifica por su código de inmobiliaria.**
  - `GET /v1/inmobiliarias` lista las inmobiliarias habilitadas para el integrador, con su código, su nombre y si está bloqueada.
  - En el sandbox, Norde es la inmobiliaria `17310373`.
- **Créditos de publicación.** Cada aviso consume un crédito del plan con el que se publica. `GET /v1/inmobiliarias/{codigo}/disponibilidad` informa lo disponible por plan, y publicar sin créditos falla (`ERR-0502`).
- **Ambientes con URLs distintas.** El sandbox de Argentina y el de producción no comparten la URL, y el sandbox solo funciona de 7 a 21 h (UTC-3).

## Decisión

- **`zonaprop` es un portal más del catálogo**, con proveedor `zonaprop`.
  - El catálogo suma cómo se conecta cada cuenta: `oauth` (MercadoLibre) o `account_code` (Zonaprop).
  - `publishes` pasa a ser una lista. Zonaprop la tiene vacía hasta la etapa 2: no aparece en la pestaña Difusión y `RequestPublication` la rechaza (`PortalNotForProperties`).
- **Las credenciales de integrador viven en el entorno**, como manda el ADR 0018: `ZONAPROP_API_URL`, `ZONAPROP_CLIENT_ID` y `ZONAPROP_CLIENT_SECRET` (las tres o ninguna) en el `env.ts` de `apps/gestion`.
  - El token **no se guarda en la base**: no es de una cuenta y se pide de nuevo cuando hace falta.
  - `ZonapropApi` (infra) lo guarda en memoria hasta 5 minutos antes de que venza. Si la API responde 401, pide otro una vez.
  - El token va en la URL (`access_token`), no en el header `Authorization`. En el sandbox, `GET /v1/inmobiliarias/{codigo}/disponibilidad` rechaza el header con `invalid_token` y acepta el parámetro, que es el que usa la documentación de Open Navent.
  - El login también manda el secreto en la URL, como exige la API. Por eso se loguea solo la ruta, nunca la URL completa.
  - De un error se loguea solo su código (`invalid_token`), nunca el mensaje: Open Navent repite ahí el token que recibió.
  - Cada pedido lleva un `User-Agent` que identifica al panel, como pide Open Navent.
- **Conexión por código desde Mi empresa → Portales**, con `portals:manage`:
  - Puerto nuevo `PortalAccountDirectory`: `find` busca la cuenta por su código y `credits` lee sus créditos. Lo implementa `ZonapropAccountDirectory`.
  - `ConnectPortalAccountWithCode` busca el código entre las inmobiliarias habilitadas, fuera de la transacción, porque es una llamada externa. Si lo encuentra, vincula la cuenta (`externalAccountId` = código, `accountName` = nombre en Zonaprop) y audita `portal_account.connected` con el antes y el después, como el OAuth.
  - Un código que no está entre las habilitadas devuelve `PortalAccountNotFound`: la inmobiliaria todavía no asoció a Norde. Una inmobiliaria bloqueada devuelve `PortalAccountBlocked`.
  - `StartPortalConnection` y `ConnectPortalAccount` (OAuth) rechazan las cuentas por código con `WrongConnectionMethod`, y al revés.
  - Desconectar es igual para las dos formas: la cuenta queda sin vincular y no se tocan los avisos que ya están en el portal.
- **Créditos en vivo.** `GetPortalCredits` los lee del portal cada vez que se abre Mi empresa → Portales, sin guardarlos. Si Zonaprop no responde, la tarjeta muestra el aviso y la página sigue funcionando.
- **Detrás de `PORTALS_ENABLED`**, como el resto de los portales.

## Consecuencias

- Para usar Zonaprop hay que cargar las tres variables y conectar la cuenta con el código de inmobiliaria. Para pasar a producción se piden credenciales nuevas a `integracion@ar.quintoandar.com` y se cambia la URL.
- Una misma credencial atiende todas las sucursales que Zonaprop asocie a Norde. Hoy el catálogo tiene una sola cuenta de Zonaprop.
- Las próximas etapas reusan `ZonapropApi`:
  - Publicación (etapa 2): un aviso por propiedad con todas sus operaciones.
  - Vinculación de los avisos que publicó Tokko (etapa 3).
  - Consultas por callbacks (etapa 4): Open Navent las autentica con un header fijo que elige el integrador, no con una firma, así que su autenticación la decide un ADR propio.
  - Emprendimientos (etapa 5).
- El ID externo de la cuenta es el código de inmobiliaria, que también es la ruta de los endpoints (`/v1/inmobiliarias/{codigo}/…`).
