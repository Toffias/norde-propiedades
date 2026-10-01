# ADR 0012: El panel de gestión adopta el sistema visual de Alquilo, con un tema propio en @norde/ui

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

`@norde/ui` tenía una paleta neutra provisoria, compartida por la web y el panel, a la espera de la identidad de Norde (`docs/modulos/02-web-diseno-seo.md`). Para el panel ya existe un sistema visual probado: el de Alquilo (`inmobiliarias-client`), una herramienta de gestión inmobiliaria con la estética "papel cálido", relevado en un documento de especificaciones visuales (tokens, componentes shadcn modificados, patrones de pantalla y gráficos).

La web pública y el panel tienen necesidades distintas: la web es la vitrina de la marca (todavía sin definir) y el panel es una herramienta densa de uso diario. Un solo juego de tokens obligaría a que la identidad de la web condicione al panel, o al revés.

## Decisión

- **El panel usa el sistema visual de Alquilo**: paleta (rojo `#e5383b`, neutros arena, carbón cálido en oscuro), tipografías (Space Grotesk + IBM Plex Sans), escala tipográfica en px, radios, componentes y patrones de pantalla. La marca es la de Norde: wordmark "Norde" e isotipo provisorio (cuadrado rojo con una "N").
- **Un tema por app en `@norde/ui`**:
  - `@norde/ui/themes/gestion.css`: tema del panel (copia adaptada del `index.css` de Alquilo).
  - `@norde/ui/globals.css`: sigue siendo el de la web, con su paleta provisoria.
  - Los **componentes son los mismos** para las dos apps y solo usan tokens; cada tema define los valores.
- **Se adapta el stack, no el look**. Alquilo es Vite + React Router; acá es Next.js:
  - Modo oscuro con `next-themes` y `data-theme` en `<html>` (en lugar de un store de Zustand y la clase `.dark`). Sin flash: next-themes aplica el tema antes del primer paint. En el panel, claro por defecto y sin opción "sistema", como en Alquilo.
  - Fuentes con `next/font` (variables CSS) en lugar de `<link>` a Google Fonts.
  - Primitivas de Radix con el paquete unificado `radix-ui`.
  - Sin i18next: el panel es solo en español; los textos van en el JSX.
  - ApexCharts se carga solo en el cliente (`lazy` + `Suspense`) desde `Chart`.
- **Las reglas de Norde mandan sobre las de Alquilo** cuando chocan. Por ejemplo, borrar es baja lógica (papelera), así que el diálogo de borrado dice dónde se restaura en lugar de "no se puede deshacer".

## Consecuencias

- El panel tiene una identidad completa desde el primer módulo, sin esperar la de la web.
- Cuando se defina la identidad de Norde, cambiar el color de marca del panel es regenerar la escala `primary-*` y `--primary`, `--ring`, `--sidebar-primary`, `--chart-1` en `themes/gestion.css`, más `CHART_COLORS.income` en `lib/chart-colors.ts`. Los componentes no cambian.
- Un componente nuevo de `@norde/ui` tiene que verse bien con los dos temas. Si usa un token que solo define un tema (ej. `bg-primary-700`), el otro tema tiene que definir un equivalente (la web lo resuelve con un `color-mix`).
- El tema conserva una particularidad del original: `html` lleva `text-sm md:text-base`, así que `1rem` vale 13 px en mobile y 14 px en desktop. Los tamaños en `rem` (alturas de controles, paddings, radios) quedan un 12 % más chicos que sus nominales de Tailwind (`h-9` mide 31,5 px en desktop). Se mantiene para que el panel se vea igual que Alquilo.
