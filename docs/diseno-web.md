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

1. **Buscar primero.** El buscador está en el hero y los filtros a la vista. Todo se puede usar sin JavaScript (formularios `GET`, `<details>`).
2. **Las fotos mandan.** Tarjetas y ficha dan el espacio a la foto. El hero usa la portada de una propiedad real, nunca una foto de stock.
3. **Un solo rojo.** El de la marca: botón principal, etiqueta de operación y foco. No decora.
4. **Cálido y redondeado.** Fondo arena (`bg-background`), tarjetas blancas (`bg-card`) con borde fino y radios grandes (`rounded-3xl` en tarjetas, `rounded-xl` en controles).
5. **El logo como firma.** El wordmark "NORDE" en serif ancha y la línea escalonada (`deco-steps`) separan secciones y subrayan títulos. Nada más usa la serif.
6. **WhatsApp siempre a mano**, con su verde, solo en sus botones. Si Norde no confirmó el número (`BUSINESS.whatsapp`), no se muestra.

## Dónde vive cada cosa

| Qué                                             | Dónde                                          |
| ----------------------------------------------- | ---------------------------------------------- |
| Tokens, modo oscuro, `deco-steps`               | `packages/ui/src/themes/web.css`               |
| Fuentes (autoalojadas con `@fontsource`)        | `apps/web/src/app/(frontend)/globals.css`      |
| Wordmark                                        | `apps/web/src/components/brand/norde-logo.tsx` |
| Título de sección con la línea escalonada       | `components/layout/section-heading.tsx`        |
| Tarjeta y grilla de propiedades                 | `components/properties/listing-card.tsx`       |
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
- Las fuentes se sirven desde el propio sitio: el build no depende de Google Fonts.

## Componentes y patrones

- **Tarjeta de propiedad**: foto 4:3 con la operación arriba a la izquierda, precio grande, título (link que cubre toda la tarjeta), ubicación y hasta cinco datos con ícono.
- **Filtros**: columna a la izquierda en desktop; plegables en mobile. Cada cambio vuelve a la página 1; el orden y la página van en la URL solo si no son los de por defecto.
- **Ficha**: galería en mosaico (portada grande + 4) con visor a pantalla completa; a la derecha, la tarjeta de contacto fija (WhatsApp y formulario).
- **Mapa**: Leaflet con OpenStreetMap ([ADR 0019](adr/0019-mapa-con-leaflet-y-geocodificacion-con-nominatim.md)). Pin si la dirección es exacta; círculo de unas cuadras si es aproximada.

## Accesibilidad

- Un solo `h1` por página; las tarjetas usan `h2` en el listado y `h3` dentro de secciones.
- Fotos con `alt` descriptivo: la descripción de la foto o "título, barrio, foto N".
- Controles con `label` visible o `aria-label`; errores del formulario asociados con `aria-describedby`.
- Foco visible en todo (`focus-visible:ring-[3px]`).
