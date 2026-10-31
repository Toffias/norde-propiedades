# ADR 0053: Las fuentes del panel se autohospedan con @fontsource

- **Estado**: aceptada
- **Fecha**: 2026-10-31
- **Reemplaza**: el punto de fuentes del ADR 0012

## Contexto

El panel cargaba Space Grotesk e IBM Plex Sans con `next/font/google` (ADR 0012). Esa opción descarga las fuentes de Google Fonts **durante el build**. Desde el 2026-10-31 el build de `@norde/gestion` falla en el CI de GitHub Actions al resolver esas descargas ("next/font/google queries have exactly one entry"), mientras que en local compila. El build del panel no puede depender de que un servicio externo responda en ese momento.

La web ya autohospeda sus fuentes con `@fontsource` (Plus Jakarta Sans y Cinzel).

## Decisión

- **`@fontsource/ibm-plex-sans` y `@fontsource/space-grotesk`**, importados en `apps/gestion/src/app/globals.css` solo con los pesos que usa el tema (Plex 400, 400 itálica, 500 y 600; Space Grotesk 500, 600 y 700).
- La app publica `--font-ibm-plex-sans` y `--font-space-grotesk` en `:root`. `themes/gestion.css` no cambia: sigue leyendo esas variables.
- Se deja de usar `next/font` en el panel.

## Consecuencias

- El build no hace pedidos a Google Fonts: es reproducible sin red externa. El navegador tampoco: las fuentes salen del propio panel.
- Cada CSS de `@fontsource` trae todos los subconjuntos con `unicode-range`; el navegador baja solo los que la página usa (latín).
- Se pierde la fuente de respaldo con métricas ajustadas que generaba `next/font`: puede haber un salto mínimo de texto mientras carga la fuente (`font-display: swap`). En un panel interno no es relevante.
