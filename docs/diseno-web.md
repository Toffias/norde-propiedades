# Diseño del sitio público

Guía visual de `apps/web`. El panel tiene la suya en [diseno-gestion.md](diseno-gestion.md); cada app tiene su tema en `@norde/ui` ([ADR 0012](adr/0012-identidad-visual-del-panel-y-temas-por-app.md)).

## Dirección: "Barrio claro" con detalles del logo

El 5 de octubre de 2026 se compararon tres direcciones y Norde eligió la más cercana e intuitiva, con dos guiños al logo original:

| Dirección              | Qué proponía                                                                             | Resultado                |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| A · Deco contemporáneo | Serif ancha, fondo marfil, rojo solo de acento, líneas escalonadas                       | Se toman sus detalles    |
| B · Rojo urbano        | Rojo dominante, tipografía muy pesada, bloques                                           | Descartada               |
| **C · Barrio claro**   | Fondo arena cálido, tarjetas blancas redondeadas, WhatsApp a mano, foco en buscar rápido | **Base de la identidad** |

## Principios

1. **Buscar sin vueltas.** El hero de la home lleva directo al listado ("Ver propiedades") y los filtros del listado están a la vista. Todo se puede usar sin JavaScript (formularios `GET`, `<details>`).
2. **Las fotos mandan.** Tarjetas y ficha dan el espacio a la foto. El hero usa la foto real de la oficina (la fachada de Emilio Castro 7250), nunca una foto de stock.
3. **Un solo rojo.** El de la marca: botón principal, etiqueta de operación y foco. No decora.
4. **Cálido y sobrio.** Fondo arena (`bg-background`), tarjetas blancas (`bg-card`) con borde fino y redondeado chico, estilo MercadoLibre: toda la escala `rounded-md` a `rounded-3xl` vale 6px (`--radius`), `rounded-sm` 4px. Solo los círculos usan `rounded-full`.
5. **El logo como firma.** El wordmark "NORDE" en serif ancha, con la línea escalonada (`deco-steps`) solo dentro del logo. Los títulos ya no llevan la línea debajo.
6. **WhatsApp siempre a mano**, con su verde, solo en sus botones. Si Norde no confirmó el número (`BUSINESS.whatsapp`), no se muestra.

## Dónde vive cada cosa

| Qué                                             | Dónde                                          |
| ----------------------------------------------- | ---------------------------------------------- |
| Tokens, modo oscuro, `deco-steps`               | `packages/ui/src/themes/web.css`               |
| Fuentes (autoalojadas con `@fontsource`)        | `apps/web/src/app/(frontend)/globals.css`      |
| Wordmark                                        | `apps/web/src/components/brand/norde-logo.tsx` |
| Título de sección (con el final destacado)      | `components/layout/section-heading.tsx`        |
| Tarjeta y grilla de propiedades                 | `components/properties/listing-card.tsx`       |
| Foto de la fachada de la oficina                | `apps/web/src/assets/fachada-norde.jpg`        |
| Textos de los valores del core (tipos, estados) | `lib/properties/labels.ts`                     |

## Color

Siempre tokens; **nunca hex sueltos en el `.tsx`**.

- Semánticos: `bg-background` (arena), `bg-card`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-primary` (rojo de marca), `text-destructive`.
- Marca: `brand-50…900`. Para etiquetas sobre foto, `bg-brand-600 text-white`; para tintes, `bg-brand-50 text-brand-700` (en oscuro, `dark:bg-brand-900/40 dark:text-brand-300`).
- `text-ink` / `bg-ink`: la tinta del logo (casi negro cálido). El llamado a propietarios usa `bg-ink`.
- `bg-whatsapp` / `text-whatsapp`: solo en botones de WhatsApp.

## Tipografía

- **Plus Jakarta Sans** (variable) para todo. Títulos en `font-extrabold`, con `tracking-tight` y `text-balance` desde la base.
- **Cinzel** solo en el wordmark (`font-wordmark`).
- **Instrument Serif** en itálica (`font-accent`), en el rojo de la marca: el final de los títulos de sección ("Propiedades _destacadas_"), con `TitleAccent` o la prop `accent` de `SectionHeading`.
- **Italiana** (`font-display`) solo en títulos grandes de portada sobre foto: los hero de la home, Tasaciones y Nosotros y contacto, con el mismo tamaño. Tiene un solo peso (400): no se le pone negrita.
- Las fuentes se sirven desde el propio sitio: el build no depende de Google Fonts.

## Componentes y patrones

- **Tarjeta de propiedad**: foto 4:3 con la operación arriba a la izquierda, precio grande, título (link que cubre toda la tarjeta), ubicación y hasta cinco datos con ícono.
- **Filtros**: columna a la izquierda en desktop; plegables en mobile. Cada cambio vuelve a la página 1; el orden y la página van en la URL solo si no son los de por defecto.
- **Ficha**: galería en mosaico (portada grande + 4) con visor a pantalla completa; a la derecha, la tarjeta de contacto fija (WhatsApp y formulario).
- **Hero de la home**: la fachada a todo el ancho y a casi toda la pantalla, con un movimiento lento (Ken Burns), y abajo a la izquierda una línea chica en mayúsculas, el título corto "Encontrá tu lugar" en Italiana y, a su derecha, "Ver propiedades" (botón blanco). En mobile el botón va debajo. Al tocarlo, el texto se desvanece y la foto pasa a ser un video que entra por la puerta del 7250 (`public/videos/entrada-norde.mp4`, 4,5 s, sin audio); al final la pantalla se funde con el fondo y se abre el listado (`components/home/hero-entrance.tsx`). La foto del hero (`assets/fachada-norde.webp`) es el mismo recorte 16:9 que el primer cuadro del video, así el cambio no se nota: si se cambia una, hay que cambiar la otra. El video se ve una vez por sesión, se puede saltear (botón, clic o Escape) y no se baja con "ahorro de datos"; las siguientes veces, o si no arranca en 1,5 s, la foto se acerca a la puerta. Sin JS, con `prefers-reduced-motion` o abriendo en otra pestaña, es un link común.
- **Salida del hero ("cortina")**: el hero de la home queda pegado arriba (`sticky`) y el resto de la home sube encima como una hoja (fondo `bg-background` con sombra hacia arriba, en `page.tsx`). Con el scroll, la foto se agranda apenas y se desenfoca, se oscurece y el texto se va (`.hero-curtain-*` en `globals.css`, con `animation-timeline: scroll()`). Sin soporte de esas animaciones (Firefox) o con `prefers-reduced-motion` queda solo la cortina, sin efectos.
- **Cinta de barrios** (home, entre destacadas y servicios): los 12 barrios o localidades con más propiedades publicadas desfilan lento en Italiana chica, y cada uno lleva al listado filtrado por esa ubicación (`components/home/neighborhoods-ribbon.tsx`). No reacciona al mouse (solo se frena con el foco del teclado); con `prefers-reduced-motion` queda quieta y se recorre con scroll horizontal.
- **Links de solo texto** ("Ver todas las propiedades →", "Limpiar todo", los de la barra de contacto): llevan `link-underline` en vez de `hover:underline`. Al pasar el mouse o tomar el foco, una línea fina crece de izquierda a derecha y la flecha avanza 4px (`globals.css`). Los botones con fondo o con borde no lo usan.
- **Header**: fijo arriba. En la home, con el scroll arriba de todo, se ve solo el header, transparente sobre el hero (sin la barra de contacto); al empezar a bajar se desvanece (sin cambiar de forma), y la barra de contacto y el header aparecen juntos, fijos arriba, cuando el contenido que sube sobre la foto (la marca `data-header-reveal` en `page.tsx`) llega al borde, y al volver a subir se repite al revés; si algo adentro toma el foco con el teclado, se muestran. En Tasaciones y Nosotros y contacto, barra y header van fijos sobre la foto: arriba de todo se ve solo el header, transparente, y al bajar se vuelve sólido y la barra de contacto se despliega arriba (`components/layout/header-shell.tsx`).
- **Movimiento** (Nosotros y contacto): parallax de fotos, una línea de tiempo que se pinta al bajar, entradas suaves al aparecer y cifras que cuentan. Siempre como extra: el HTML del servidor ya muestra todo en reposo (nada arranca invisible) y con `prefers-reduced-motion` no se anima nada. Las piezas están en `components/about/` (`Parallax`, `Reveal`, `CountUp`).
- **Mapa**: Leaflet con OpenStreetMap ([ADR 0019](adr/0019-mapa-con-leaflet-y-geocodificacion-con-nominatim.md)). Pin si la dirección es exacta; círculo de unas cuadras si es aproximada.

## Accesibilidad

- Un solo `h1` por página; las tarjetas usan `h2` en el listado y `h3` dentro de secciones.
- Fotos con `alt` descriptivo: la descripción de la foto o "título, barrio, foto N".
- Controles con `label` visible o `aria-label`; errores del formulario asociados con `aria-describedby`.
- Foco visible en todo (`focus-visible:ring-[3px]`).
