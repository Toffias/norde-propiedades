# ADR 0011: La web no lee la base en el build; las páginas con datos se renderizan on-demand

- **Estado**: aceptada
- **Fecha**: 2026-09-22

## Contexto

El CI compila `apps/web` sin base de datos (variables ficticias). DS-DESIGN-Landing pre-generaba las páginas en el build leyendo Payload, lo que obliga a tener la base accesible (y con las migraciones aplicadas) en cada build. Además, con la base disponible, el contenido generado en el build queda desactualizado hasta la próxima revalidación.

Next.js 16 ofrece Cache Components (`'use cache'`), pero Payload todavía no lo soporta de forma estable en el mismo proyecto que el admin.

## Decisión

- **Ninguna página lee la base durante el build.**
  - Rutas dinámicas del blog (`/blog/[slug]`, categorías, paginación): **ISR on-demand**. `generateStaticParams` devuelve `[]`, cada página se genera en su primera visita y queda cacheada.
  - Rutas fijas con datos (`/`, `/blog`, `sitemap.xml`, `llms.txt`): `dynamic = 'force-dynamic'`. Se renderizan por request, pero sus datos salen del caché.
- **Caché de datos por tag**: las consultas a Payload (`src/lib/blog/queries.ts`) usan `unstable_cache` con el tag `blog`. Los hooks `afterChange`/`afterDelete` de posts, categorías, autores y redirecciones lo invalidan con `revalidateTag('blog', { expire: 0 })`, así que lo publicado se ve en la próxima visita. Como respaldo, el caché expira cada hora.
- Un solo tag para todo el blog: el volumen de cambios editoriales es bajo y evita olvidar una página.
- Las propiedades (F3) siguen el mismo criterio, con sus propios tags (`property:<id>`).

## Consecuencias

- El build no depende de la base ni del estado de las migraciones.
- La primera visita a cada post tras un deploy o una publicación es más lenta (render + consulta); las siguientes salen del caché.
- La home y `/blog` hacen SSR en cada request, pero sin ir a la base mientras el caché esté vigente.
- Si más adelante Payload soporta Cache Components, se puede migrar a `'use cache'` + `cacheTag` cambiando solo `queries.ts` y la configuración de las páginas.
