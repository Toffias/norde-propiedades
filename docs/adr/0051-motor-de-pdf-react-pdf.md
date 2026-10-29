# ADR 0051: Los PDF se arman con @react-pdf/renderer

- **Estado**: aceptada
- **Fecha**: 2026-10-29

## Contexto

El #175 pide PDFs con un diseño igual o mejor que los de Tokko:

- la selección del buscador en 5 formatos;
- la vidriera con opciones;
- el reporte al propietario;
- la planilla y el informe de tasación.

Hoy se arman con **pdf-lib** (`packages/infra/src/adapters/exports/pdf-kit.ts`). Ese esquema tiene cuatro límites:

- Solo usa las fuentes estándar Helvetica, que codifican Latin-1: `printable()` borra lo demás y no hay tipografía de marca.
- No hay motor de layout. Cada salto de línea, de columna y de página se calcula a mano con un cursor, y por eso es difícil que un texto largo o una tabla no se corten.
- La hoja es una sola, A4 vertical. Los formatos horizontales, la grilla comparativa y la vidriera horizontal piden reescribir el cursor.
- Los íconos y el número de página "x de y" no están, o salen a mano.

El spike del 2026-10-29 armó la ficha "Horizontal 1 por página" con 8 fotos y una descripción larga, y midió tres opciones:

| Opción                                     | Tiempo por PDF                                | Memoria                                   | Resultado                                                                                                          |
| ------------------------------------------ | --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| pdf-lib + `@pdf-lib/fontkit`               | Similar al actual                             | Sin cambios                               | Resuelve las fuentes, pero el layout sigue siendo a mano                                                           |
| `@react-pdf/renderer` 4.9                  | ~160 ms (~480 ms el primero, con las fuentes) | El proceso de Node que ya existe          | Flexbox, saltos de página solos, cabecera y pie fijos, "Página x de y", fuentes propias embebidas y en subset, SVG |
| HTML + CSS → PDF con Chromium (Playwright) | ~15 ms (después de levantar el navegador)     | **+240 MB** de Chromium al lado del panel | El diseño más libre, pero suma un navegador en el VPS compartido                                                   |

El panel corre los jobs en el mismo proceso que Next (ADR 0021), en un VPS compartido. Chromium agrega un navegador que hay que instalar y mantener en el servidor, y le saca memoria al panel. pdf-lib con fontkit no resuelve lo que más cuesta, que es el layout.

## Decisión

- Los PDF nuevos y los rediseñados se arman con **`@react-pdf/renderer`** en `@norde/infra`, como componentes `.tsx`. Las piezas comunes viven en `packages/infra/src/adapters/exports/pdf/`:
  - `kit.tsx`: hoja A4 vertical u horizontal con cabecera y pie fijos, secciones, pares "Etiqueta: valor", listas en columnas, precio con badge de operación, datos clave con íconos, fotos y descripción en párrafos.
  - `icons.tsx`: íconos de `lucide`, los mismos del panel, dibujados como SVG.
  - `format.ts`: plata, superficies, plurales y teléfono, con espacio duro entre el número y la unidad; la descripción en párrafos, sin el HTML que arrastra de otros sistemas.
  - `theme.ts`: colores, cuerpos y registro de la tipografía.
  - `render.ts`: `renderPdf(<PdfDocument>…)` devuelve los bytes.
- **Identidad: la del sitio público**, no la del panel, porque los PDF los lee el cliente. Es la tipografía Plus Jakarta Sans y el rojo de marca `#c9302b` (`packages/ui/src/themes/web.css`).
- **Las fuentes viajan en el código**:
  - `fonts.generated.ts`, en base64: 400, 600 y 800, subset latin, 64 KB.
  - Se genera con `pnpm --filter @norde/infra pdf:fonts` desde `@fontsource/plus-jakarta-sans`.
  - Así el PDF sale igual en Vitest, en `next dev` y en el build de Turbopack, sin depender de rutas de archivos en el servidor.
- **Las fotos se siguen preparando con sharp** (recorte, rotación EXIF, JPEG) antes de pasarlas a `PdfPhoto`. react-pdf solo las ubica.
- **pdf-lib se retira de a un PDF.** Cada renderer de `pdf-kit.ts` (ficha, vidriera, reporte, informe de tasación, listado del buscador) pasa al kit en su etapa del #175. Cuando no quede ninguno, se borran `pdf-kit.ts` y la dependencia `pdf-lib`. pdf-lib queda en los tests, para leer los PDF generados.
- Está verificado en `next build` + `next start` de `apps/gestion`, sin `serverExternalPackages`.

## Consecuencias

- `@norde/infra` suma `react`, `@react-pdf/renderer` y `lucide`, y compila JSX (`"jsx": "react-jsx"`). ESLint aplica las reglas de librería a los `.tsx` y Vitest corre los `*.test.tsx`.
- Trampas de react-pdf que el kit ya evita (documentadas en `kit.tsx`):
  - `lineHeight` sin unidad toma el `fontSize` del mismo estilo. Si falta el `fontSize`, el interlineado sale enorme.
  - Un `lineHeight` heredado de la hoja, o puesto en un texto con `render` (el número de página), hace que ese texto no se dibuje.
  - Un `Svg` dentro de un `Text` no se dibuja.
  - Un texto que pasa de página dentro de una fila flex corta por párrafos, no por líneas.
- El texto de los PDF es real: se puede seleccionar, buscar y leer con un lector de pantalla, con `ToUnicode` e idioma `es-AR`. En los de Tokko, en cambio, el texto está dibujado.
- Cada PDF tarda ~160 ms. Una selección de 100 propiedades con fotos son ~20 s: va como job (#175, etapa 1).
- La primera vez que corre en el proceso, registrar las fuentes suma ~300 ms.
