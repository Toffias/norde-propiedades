# Módulo 2: Web + Diseño + SEO

> Documento de detalle del módulo "Web + Diseño + SEO" de [diagrama-general.md](../diagrama-general.md).
> Base técnica: el enfoque Next.js + Payload CMS de `C:\DS-DESIGN-Landing`.

## 1. Objetivo

El sitio público de Norde Propiedades:

- **Rediseño** completo del sitio.
- **Blog + SEO + GEO**, para posicionar en Google y en buscadores de IA (ChatGPT, Perplexity, Gemini, AI Overviews).
- **Sugerencias al ingresar y Destacados**: un modal promocional con un emprendimiento o una unidad que Norde quiera publicitar, más los destacados en la home.
- **Oportunidades por mail**: alertas de propiedades nuevas según la búsqueda de cada persona.
- **Web Chat**: el widget del agente de IA del módulo 1.

### División de responsabilidades

| Qué                                                          | Dónde se administra                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Blog: artículos, categorías, autores                         | **Payload CMS** (admin en `/admin` del sitio)                                                                    |
| Páginas institucionales: home, nosotros, servicios, contacto | **Payload CMS** (page builder por bloques)                                                                       |
| Header, footer, redirecciones, formularios                   | **Payload CMS**                                                                                                  |
| **Propiedades, emprendimientos, destacados**                 | **Sistema de Gestión** (módulo 3). Se cargan en el panel; la web solo los **lee**, con los casos de uso del core |
| Clientes, consultas, suscripciones a alertas                 | **Sistema de Gestión**. La web solo **envía** los datos                                                          |

> Payload queda como CMS de **contenido editorial**, no como sistema del negocio. Así no se duplican propiedades ni clientes en dos lugares.

---

## 2. Stack (reutilizado de DS-DESIGN-Landing)

| Pieza           | Tecnología                                                               |
| --------------- | ------------------------------------------------------------------------ |
| Framework       | **Next.js 16** (App Router), React 19, TypeScript                        |
| CMS             | **Payload 3.85** embebido en el mismo Next.js                            |
| Base de datos   | PostgreSQL (`@payloadcms/db-postgres`), con migraciones versionadas      |
| Editor          | Lexical: headings, bloques embebidos, tablas, links internos             |
| Plugins Payload | `seo`, `redirects`, `nested-docs` (categorías), `search`, `form-builder` |
| UI              | Tailwind v4 + shadcn/ui + Radix + lucide-react                           |
| Imágenes        | `sharp`, con tamaños predefinidos (thumbnail … xlarge y **og 1200x630**) |
| Sitemaps        | `next-sitemap` + sitemaps dinámicos por route handler                    |
| Analítica       | Google Tag Manager, más eventos de click propios (WhatsApp, redes)       |
| Paquetes        | pnpm                                                                     |
| Deploy          | VPS Hostinger + PM2 + Nginx + Certbot, con deploy por GitHub Actions     |

### Qué se copia tal cual

- **Colección `Posts`**:
  - Pestañas de contenido, meta y SEO.
  - Borradores con autoguardado, publicación programada, hasta 50 versiones y live preview (mobile, tablet, desktop).
  - `relatedPosts` elegidos a mano, categorías y **autores con bio**, que es una señal E-E-A-T.
  - Revalidación del caché al publicar o despublicar.
- **`constants/business.ts`**: una única fuente para los datos del negocio (nombre, teléfono, WhatsApp, dirección, coordenadas, redes). La usan la metadata, el JSON-LD y `llms.txt`.
- **`generateMeta`**: title, description, canonical, Open Graph y Twitter card.
- **JSON-LD**:
  - `Organization` con `@id` en todas las páginas.
  - `BlogPosting` con autor `Person`.
  - `FAQPage` en el bloque de preguntas frecuentes.
  - `AggregateRating` y `Review` en el bloque de reseñas.
- **Sitemaps** separados para páginas y posts, con caché por tag.
- **`llms.txt`** generado por una ruta.
- **Headers de seguridad**: HSTS, `nosniff`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy.
- **Preview seguro** con `PREVIEW_SECRET` y draft mode.
- **Procedimiento editorial** de `content/blog/README.md`:
  - Sin H1 en el cuerpo del artículo.
  - Foto de portada real y autor real.
  - Preguntas frecuentes al final.
  - Frecuencia sugerida: 2 posts por semana.
- **Skills de redacción** (`skills/blog`, `skills/blog-anti-ia`), adaptadas al rubro inmobiliario.

### Qué NO copiar o hay que corregir (problemas detectados en DS-DESIGN-Landing)

| Problema                                                                                           | Corrección en Norde                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imágenes en disco local (`public/media`)                                                           | Adapter de nube (`@payloadcms/storage-s3`, compatible con S3 y Cloudflare R2). Es el mismo "servicio en la nube para IMGs" del sistema de gestión |
| La paginación usa botones con `router.push`, que los buscadores no pueden seguir                   | Paginación con `<a href>` reales                                                                                                                  |
| Se pre-generan `ceil(total/10)` páginas pero se listan 12 por página                               | Una sola constante de tamaño de página                                                                                                            |
| No hay páginas de categoría                                                                        | `/blog/categoria/[slug]` con su metadata y su lugar en el sitemap                                                                                 |
| El plugin de búsqueda está configurado pero no hay página `/search`                                | Página de búsqueda del blog, o sacar el plugin                                                                                                    |
| Textos en inglés ("Author", "Date Published", autores unidos con "and")                            | Todo en español                                                                                                                                   |
| La imagen OG por defecto no existe                                                                 | Imagen OG real de la marca Norde                                                                                                                  |
| La URL de los posts en el plugin SEO (`generateURL`) arma `/slug` en lugar de `/posts/slug`        | Corregir la ruta                                                                                                                                  |
| Falta `BreadcrumbList`                                                                             | Implementarlo en blog y propiedades                                                                                                               |
| No hay fecha visible de "última actualización"                                                     | Mostrarla en los posts                                                                                                                            |
| Husky y lint están rotos (scripts inexistentes, ESLint circular) y el test E2E está desactualizado | Dejar lint, typecheck y tests funcionando desde el día 1                                                                                          |
| El blog vive en `/posts`, con redirección desde `/blog`                                            | Usar **`/blog`** como ruta principal (mejor para SEO en español)                                                                                  |

---

## 3. Rediseño: páginas del sitio

| Página                                                             | Contenido                                                                                                                                                         | Fuente de datos             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Home**                                                           | Hero con buscador (operación, tipo, zona), Destacados, sugerencias, emprendimientos, servicios (tasaciones, administración de alquileres), reseñas, últimos posts | Payload (bloques) + core    |
| **Listado de propiedades** `/propiedades`                          | Filtros (operación, tipo, zona, precio, moneda, ambientes, amenities), orden, vista de **lista y de mapa**, paginación                                            | Core (`properties`)         |
| **Ficha de propiedad** `/propiedades/[slug]`                       | Galería, datos, mapa, descripción, botón "Consultar por WhatsApp", **web chat con contexto de la propiedad**, propiedades similares                               | Core (`properties`)         |
| **Emprendimientos** `/emprendimientos` y `/emprendimientos/[slug]` | Ficha del desarrollo, unidades disponibles, avance de obra                                                                                                        | Core (`properties`)         |
| **Landings por zona y operación**                                  | Por ejemplo, `/alquiler/departamentos/palermo`: texto editorial más el listado filtrado (ver 4.3)                                                                 | Payload + core              |
| **Tasaciones** `/tasar-mi-propiedad`                               | Formulario de solicitud, que crea la tasación en el sistema de gestión                                                                                            | Formulario → core           |
| **Vender o alquilar con Norde**                                    | Propuesta de valor para propietarios                                                                                                                              | Payload                     |
| **Nosotros / Equipo**                                              | Agentes con foto y matrícula (señal E-E-A-T)                                                                                                                      | Payload                     |
| **Blog** `/blog`                                                   | Listado, categorías, artículo, autor                                                                                                                              | Payload                     |
| **Contacto**                                                       | Formulario, mapa, WhatsApp, horarios                                                                                                                              | Payload + formulario → core |

**Transversal a todo el sitio:**

- Botón flotante de WhatsApp.
- Widget de web chat.
- Tema claro y oscuro con tokens semánticos.
- Diseño mobile-first.

**Diseño:**

- La identidad de Norde (paleta, tipografía, tono) está en [diseno-web.md](../diseno-web.md). El `DESIGN.md` de DS-DESIGN-Landing describe otro producto y no se usa.
- Se mantienen las reglas útiles: solo tokens semánticos (`bg-card`, `text-foreground`), extender los componentes de shadcn en lugar de reescribirlos y probar en claro y oscuro.

**Performance** (impacta en SEO):

- Las fichas de propiedad se generan con **ISR** (render estático con revalidación).
- Cuando cambia una propiedad, el sistema de gestión llama a un webhook de revalidación de la web (`revalidateTag('property:<id>')`).
- Imágenes con `next/image` y tamaños responsivos.

---

## 4. Blog + SEO + GEO

### 4.1 Blog

- Misma estructura de Payload que DS-DESIGN-Landing, con las correcciones de la sección 2.
- **Categorías sugeridas**: Comprar, Alquilar, Vender, Inversión, Barrios, Créditos hipotecarios, Legales y contratos, Mercado inmobiliario.
- **Temas con alta intención y alta citabilidad por IA**:
  - Guías de barrios ("Vivir en Palermo: precios, transporte, seguridad").
  - Costos ("¿Cuánto cuesta escriturar en CABA en 2026?").
  - Alquileres ("Cómo se calcula el aumento por IPC").
  - Créditos hipotecarios, pasos para vender, tasación.
- **Enlazado interno**: los artículos enlazan a las landings de zona y a las propiedades, y las fichas de propiedad enlazan a la guía del barrio.

### 4.2 SEO técnico

- **Metadata** por página (title, description, canonical, OG) con `generateMeta`.
- **JSON-LD específico del rubro**:
  - `RealEstateAgent` (en lugar de `FurnitureStore`) para la organización, con dirección, `geo`, `sameAs` y horario.
  - **Ficha de propiedad**: `RealEstateListing` con `Offer` (precio y moneda), y un `Accommodation`, `Apartment` o `House` con `address`, `geo`, superficie y ambientes.
  - `BreadcrumbList` en fichas, landings y blog.
  - `FAQPage` en los posts y en las landings de zona.
  - Agentes del equipo como `Person` con `worksFor`.
- **Sitemaps**:
  - Páginas y posts, como en DS-DESIGN-Landing.
  - **Propiedades** y **emprendimientos**, generados desde el core (solo publicadas).
  - Landings por zona.
- **Propiedades vendidas o dadas de baja**: devolver `410` o redirigir a propiedades similares. Nunca un `404` masivo.
- **`robots.txt`**: bloquear `/admin` y las rutas de filtros con parámetros infinitos. Permitir explícitamente los crawlers de IA (GPTBot, ClaudeBot, PerplexityBot, Google-Extended).

### 4.3 Landings programáticas por zona

- Una combinación de **operación, tipo y zona** tiene página propia solo si hay stock suficiente (por ejemplo, 3 o más propiedades). Así se evitan páginas vacías o "thin content".
- El contenido editorial de la landing (intro, preguntas frecuentes del barrio) se carga en Payload con una colección `Zonas` (nombre, slug, texto, FAQ, imagen). El listado se trae del core.

### 4.4 GEO (buscadores de IA)

- **`llms.txt`** con la descripción del negocio, zonas donde opera, servicios, links a las categorías de propiedades y a las guías del blog.
- Contenido **citable**:
  - Respuestas directas en el primer párrafo.
  - Datos concretos (precios promedio, costos, plazos) con fecha.
  - FAQ al final de cada artículo.
- **Autoridad de marca**:
  - Google Business Profile.
  - Perfiles consistentes en redes y portales (`sameAs`).
  - Reseñas.
- Auditoría GEO inicial y mensual con los skills `geo-*` disponibles. DS-DESIGN-Landing arrancó en 64/100; conviene medir el punto de partida de Norde.

---

## 5. Sugerencias al ingresar y Destacados

- **Destacados**: propiedades marcadas como "Destacada" en el sistema de gestión. Se muestran en la home y en los listados (primeras posiciones o un bloque aparte).

### Sugerencias al ingresar: modal promocional

Al abrir la web, aparece un **modal con un emprendimiento o una unidad a la venta** que Norde quiera publicitar.

**Se configura en el Sistema de Gestión** (ver módulo 3, sección 4.4), porque lo que se promociona es una propiedad o un emprendimiento de ahí:

- Qué promocionar: un emprendimiento, una unidad o una propiedad.
- Imagen propia del modal (opcional). Si no se carga, se usa la portada de la propiedad.
- Título, texto corto y botón de acción ("Ver emprendimiento", "Consultar por WhatsApp").
- Vigencia (desde y hasta) y activo o inactivo.
- Opcional: más de una promoción activa, con rotación o prioridad.

**Comportamiento en la web:**

- Aparece 1 o 2 segundos después de cargar la página, no antes de mostrar el contenido.
- Se muestra **una vez por sesión** (o cada N días), con un registro en `localStorage`, para no molestar al que ya lo cerró.
- Se cierra con una X visible, con Esc o tocando afuera. Es accesible (foco atrapado, `role="dialog"`).
- **En mobile**: conviene un banner inferior o una tarjeta chica en vez de un modal a pantalla completa, porque Google penaliza los "interstitials intrusivos" en mobile.
- Se registran vista, click y cierre (GTM y eventos de click) para medir si la promoción funciona.
- Se carga con el caso de uso `GetActivePromotion` del core, cacheado y revalidado cuando cambia la promoción en la gestión.

---

## 6. Oportunidades por mail

Alertas de propiedades nuevas que coinciden con la búsqueda de cada persona.

1. **Suscripción**: el visitante deja su email y su búsqueda desde:
   - Un formulario "Avisame cuando haya algo así" en el listado o en la ficha.
   - El web chat (el agente puede ofrecerlo).
   - La suscripción al blog.
2. La suscripción se guarda en el **sistema de gestión** como cliente con una búsqueda guardada (origen = web).
3. **Cruce**: una tarea programada del sistema de gestión detecta propiedades nuevas o bajas de precio que coinciden con cada búsqueda guardada (ver módulo 3, sección 3.4).
4. **Envío**: un mail con las propiedades (plantilla con la marca Norde), con frecuencia **inmediata, diaria o semanal** a elección del usuario.
5. **Cumplimiento**:
   - **Doble opt-in**.
   - Link de baja en cada mail.
   - Registro del consentimiento (Ley 25.326 de Protección de Datos Personales).
   - Dominio propio con SPF, DKIM y DMARC configurados.

**Servicio de mailing** (costo en "Otros costos"). Opciones:

- **Resend** o **Postmark**: transaccionales, simples y baratos.
- **Brevo**: incluye campañas y newsletter.
- **Hostinger Reach**: si todo queda en Hostinger.

Recomendación: usar un servicio transaccional para las alertas y, si más adelante se quiere un newsletter del blog, evaluar Brevo o Reach.

---

## 7. Integración con el Sistema de Gestión

La web **no consume una API de la gestión**. Llama directamente a los casos de uso de `@norde/core` desde Server Components y Server Actions (ver [arquitectura.md](../arquitectura.md)).

| Uso                                      | Caso de uso (módulo)                                                                                                                        | Modo                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Listado y filtros                        | `SearchProperties` (`properties`): filtros, orden y página; la misma búsqueda que usa el agente                                             | Server Component, con caché                                    |
| Ficha                                    | `GetPropertyDetail` (`properties`) por slug. `PropertyNotListed` (vendida, reservada o despublicada) → 410                                  | ISR con tag `property:<id>`                                    |
| Emprendimientos                          | `GetPublishedDevelopment`, `SearchPublishedDevelopments` (`properties`)                                                                     | ISR                                                            |
| Destacados y similares                   | `SearchProperties` con `featuredOnly`, o con `excludePropertyId` y los filtros de la ficha                                                  | Con caché                                                      |
| Modal promocional                        | `GetActivePromotion` (`promotions`)                                                                                                         | Con caché, tag `promotions`                                    |
| Mapa                                     | `GetPropertiesMap` (`properties`): solo id, lat/lng, precio y tipo                                                                          | Con caché                                                      |
| Formularios (contacto, tasación, alerta) | `RegisterContact` (`clients`), `RequestAppraisal` (`appraisals`), `SubscribeToAlerts` (`clients`)                                           | Server Action con rate limit y Turnstile, `actor = system:web` |
| Fotos                                    | `GetPublicPhoto` (`properties`) en `/fotos/<id>/<versión>`                                                                                  | Route handler, caché inmutable                                 |
| Revalidación                             | `property_changed`, `media_changed` o `media_deleted` → job `RevalidatePublicProperty` en `apps/gestion` → `POST /api/revalidate` de la web | Webhook firmado (ADR 0023)                                     |

- La web se conecta con el mismo usuario de base que las otras apps (ADR 0015). Lo que puede hacer lo limita su `Actor`: `system:web`, con `properties:read`.
- **Qué se publica** lo decide el dominio (`properties/domain/public-listing.ts`):
  - Solo propiedades disponibles, con "Publicar en web" y al menos una operación.
  - El precio de cada operación, salvo que la propiedad oculte el precio en la web o la operación sea "a consultar".
  - La dirección exacta solo si la propiedad lo permite; si no, la dirección aproximada (`publish_address`). Lo mismo con el pin del mapa, que se redondea a la manzana.
  - Las fotos y planos marcados "Mostrar en la web" que ya tienen su versión web, con marca de agua si Mi empresa la activó. La original nunca.
  - Las fotos se sirven en `/fotos/<id>/<versión>`. La versión cambia cuando cambia la foto, así se cachean para siempre ([ADR 0023](../adr/0023-fotos-publicas-y-revalidacion-de-la-web.md)).
  - La web lee el mismo bucket privado que el panel, con su propia clave de solo lectura. El panel ve todo; la web, solo lo publicado.
- **Revalidación** ([ADR 0023](../adr/0023-fotos-publicas-y-revalidacion-de-la-web.md)):
  - Cualquier cambio de una propiedad o de su galería emite un evento.
  - Un job de `apps/gestion` llama a `POST /api/revalidate` de la web, firmado con el secreto compartido (`WEB_REVALIDATE_SECRET` en gestión, `REVALIDATE_SECRET` en la web).
  - La web invalida `property:<id>` y `properties`.
  - Como respaldo, las consultas cacheadas expiran cada hora.
- Los datos personales **no** se guardan en Payload. La colección `ContactMessages` de DS-DESIGN-Landing no se replica.

---

## 8. Deploy (lecciones de DS-DESIGN-Landing)

- VPS Hostinger, PM2 y Nginx (`client_max_body_size` alto para las fotos) con SSL por Certbot.
- **Deploy automático por GitHub Actions**: primero CI (instalar, `generate:types`, `migrate`, `build`); si pasa en `main`, deploy por SSH con `pm2 reload`.
- Lecciones a mantener:
  - Build en el VPS con `--max-old-space-size=2048` y swap de 4 GB.
  - Correr `payload migrate < /dev/null`, porque el prompt interactivo colgó un deploy.
  - **Nunca** correr Payload en modo dev contra la base de producción.
  - Los `defaultValue` no completan globals que ya existen: hacen falta scripts de corrección.

---

## 9. Plan de trabajo sugerido

| Fase                          | Alcance                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **F1: Base**                  | Proyecto Next.js + Payload a partir de DS-DESIGN-Landing, limpio y con las correcciones de la sección 2. Storage en la nube. CI y deploy |
| **F2: Diseño**                | Identidad de Norde, `DESIGN.md`, componentes base, header y footer, home                                                                 |
| **F3: Propiedades en la web** | Listado, filtros, mapa, ficha y emprendimientos consumiendo los casos de uso del core, más revalidación                                  |
| **F4: Blog**                  | Posts, categorías, autores, paginación y JSON-LD. Primeros 8 a 10 artículos                                                              |
| **F5: SEO y GEO**             | JSON-LD del rubro, sitemaps de propiedades, landings por zona, `llms.txt`, auditoría GEO inicial                                         |
| **F6: Conversión**            | Formularios hacia la gestión, widget de web chat (módulo 1), sugerencias y destacados                                                    |
| **F7: Alertas por mail**      | Suscripción, doble opt-in, envío periódico                                                                                               |

### Estado de implementación

**Hecho (base de F2, F4 y F5):**

- **Admin de Payload** (`/admin`), grupo "Blog":
  - **Artículos** (`posts`): pestañas Contenido, Preguntas frecuentes y SEO. Borradores con autoguardado, publicación programada (la ejecuta el cron de jobs de Payload), 50 versiones y live preview (mobile, tablet, desktop). Editor sin H1, con H2 a H4, listas, citas, tablas, imágenes y links internos a otros posts. Autores, categorías y hasta 3 artículos relacionados.
  - **Categorías** (`categories`): nombre, descripción (intro y meta description) y slug.
  - **Redirecciones** (grupo "Configuración"): 301 hacia un post o una URL.
  - **Usuarios**: nombre, cargo, bio y foto. El sitio muestra solo esos datos (nunca el email).
  - Slugs sin acentos ni eñes (`como-se-calcula-el-ipc`), con `pagina` y `categoria` reservados.
- **Blog**: `/blog`, `/blog/pagina/<n>`, `/blog/categoria/<slug>` (con su paginación) y `/blog/<slug>`. Paginación con `<a href>` y una sola constante de tamaño (`POSTS_PER_PAGE`).
- **Post**: fecha de publicación y de última actualización visibles, tiempo de lectura, autores con bio, FAQ con `<details>`, artículos relacionados.
- **SEO**:
  - `buildMetadata` (title, description, canonical, Open Graph y Twitter card) en todas las páginas.
  - JSON-LD: `RealEstateAgent` y `WebSite` sitewide, `BlogPosting` con autores `Person`, `BreadcrumbList` y `FAQPage`.
  - `sitemap.xml` (home, blog, categorías con posts y posts), `robots.txt` (crawlers de IA permitidos explícitamente), `llms.txt` e imagen OG por defecto en `/og-image.png`.
  - Headers de seguridad y `X-Robots-Tag: noindex` en el admin.
- **Home**: hero con buscador (operación, tipo y zona, hacia `/propiedades` con query params en español), servicios, últimos artículos y llamado para propietarios.
- **Caché**: ver [ADR 0011](../adr/0011-web-render-on-demand-sin-base-en-el-build.md). Al publicar, los hooks invalidan el tag `blog` y el cambio se ve en la próxima visita.
- **Identidad** ([diseno-web.md](../diseno-web.md)): dirección "Barrio claro" con el wordmark y la línea escalonada del logo. Tema en `packages/ui/src/themes/web.css`; fuentes autoalojadas.
- **Header, footer y WhatsApp flotante**: el WhatsApp aparece cuando Norde confirme el número en `src/constants/business.ts`.
- **Home**: hero con la portada de una destacada, buscador, destacadas (primero las marcadas, después las más nuevas), servicios, blog y llamado a propietarios.
- **Listado** `/propiedades`: filtros en la URL en español (`operacion`, `tipo`, `zona`, `moneda`, `desde`, `hasta`, `ambientes`, `dormitorios`, `orden`, `pagina`), orden, paginación en el servidor con `<a href>` y estado vacío. Indexa operación, tipo, zona y página; los filtros finos llevan `noindex`.
- **Ficha** `/propiedades/<slug>`: galería con visor, precio de cada operación, características, planos, videos y recorridos, mapa (pin exacto o zona aproximada), consulta por WhatsApp o por formulario, similares y JSON-LD `RealEstateListing` + `BreadcrumbList`.
  - El formulario manda la consulta firmada al webhook del panel (ADR 0021), con validación, trampa para bots y límite de 5 envíos por IP cada 10 minutos.
  - Una propiedad que ya no se ofrece muestra "ya no está disponible" con otras opciones y `noindex`. Next no permite responder 410 desde una página: responde 200 sin indexar.
- **Sitemap**: suma el listado y cada ficha publicada.
- **Datos de propiedades** (base de F3): `src/container.ts` arma `SearchProperties`, `GetPropertyDetail` y `GetPublicPhoto` con `system:web`. Ya están la ruta de fotos `/fotos/<id>/<versión>` y `POST /api/revalidate` ([ADR 0023](../adr/0023-fotos-publicas-y-revalidacion-de-la-web.md)).

**Diferencias con lo planeado:**

- El **preview** se autoriza con la sesión del admin de Payload (`/next/preview` verifica al usuario), no con un `PREVIEW_SECRET`: el secreto viajaba en la URL y no agregaba seguridad real.
- Los sitemaps usan el `sitemap.ts` de Next.js en lugar de `next-sitemap`.
- No se instalaron `search` (no hay página de búsqueda del blog todavía), `nested-docs` (las categorías son planas) ni `form-builder` (los formularios van al core, sin guardar datos personales en Payload).

**Pendiente:**

- Datos del negocio en `src/constants/business.ts` (teléfono, WhatsApp, dirección, zonas, redes): están en `null` hasta que Norde los confirme. Sin esos datos no se muestran ni se publican en el JSON-LD.
- Header, footer y home editables desde Payload (globals y page builder por bloques), storage en la nube para las imágenes del blog y E2E con Playwright.
- Vista de mapa del listado, favoritos, emprendimientos (F3) y `/tasar-mi-propiedad` (F6).
- Turnstile en el formulario de consulta (hoy: trampa para bots y límite por IP).

---

## 10. Preguntas abiertas

1. **Sitio actual**: ¿Norde tiene hoy un sitio web? ¿Hay URLs con posicionamiento que haya que redirigir?
2. **Dominio**: ¿cuál es el dominio definitivo? ¿Ya está registrado?
3. **Identidad visual**: ¿hay manual de marca, logo o paleta, o se diseña desde cero?
4. **Zonas**: ¿en qué barrios y localidades opera Norde? Define las landings y el `llms.txt`.
5. **"Sugerencias al ingresar"**: ✅ Definido. Es un modal promocional configurable desde la gestión (sección 5).
6. **¿Quién escribe el blog?** ¿El equipo de Norde, SurisCode con IA revisada, o ambos? ¿Con qué frecuencia?
