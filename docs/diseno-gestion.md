# Diseño del panel de gestión

Guía visual de `apps/gestion`. El porqué de las decisiones está en el [ADR 0012](adr/0012-identidad-visual-del-panel-y-temas-por-app.md). La referencia viva es la ruta **`/dev/design-system`** (solo en desarrollo: `pnpm --filter @norde/gestion dev` y abrir `http://localhost:3001/dev/design-system`).

## Principios

1. **Las cards no flotan.** Card blanca sobre fondo crema, separada por el borde. La sombra (`shadow-3xl`) aparece solo en el hover de elementos clickeables y en popovers.
2. **Neutros cálidos, nunca azulados.** Grises "arena"; en oscuro, carbón cálido.
3. **Un solo acento.** El rojo de marca es el botón principal, el item activo del menú, el foco y la primera serie de los gráficos. No decora.
4. **Estados con tintes planos** y texto oscuro del mismo tono. Nunca fondos saturados.
5. **Densidad de herramienta**: cuerpo de 13–14 px, controles `h-9`, tablas `text-sm` con cabeceras `text-xs`.
6. **Dos tipografías**: Space Grotesk para títulos y números grandes (`font-display`); IBM Plex Sans para todo lo demás.
7. **Títulos de pantalla discretos** (`PageHeader`): el peso visual lo llevan los datos.
8. **Toda acción destructiva va en rojo y se confirma en un diálogo.** Como borrar es baja lógica, el diálogo dice que va a la papelera.

## Dónde vive cada cosa

| Qué                                                                   | Dónde                                                             |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Tokens, tipografía base, modo oscuro, overrides de ApexCharts         | `packages/ui/src/themes/gestion.css`                              |
| Componentes base (shadcn modificados) y de aplicación                 | `packages/ui/src/components/*`                                    |
| `cn`, `escapeHtml`, tamaños de página, colores y opciones de gráficos | `packages/ui/src/lib/*`                                           |
| Fuentes, tema por defecto, Toaster y tooltips                         | `apps/gestion/src/app/layout.tsx`, `src/components/providers.tsx` |
| Formato de montos y fechas                                            | `apps/gestion/src/lib/format.ts`                                  |
| Mensajes de validación en español                                     | `apps/gestion/src/lib/zod-messages.ts`                            |
| Resolver de formularios sobre los contracts                           | `apps/gestion/src/lib/form.ts` (`contractResolver`)               |

**No reinstalar componentes con `shadcn add`**: los de `@norde/ui` están modificados (radios, fondos, tabs en pill, sheet con banda de cabecera, toast invertido) y saldrían los de fábrica.

## Color

Usar siempre tokens. **Nunca hex sueltos en el `.tsx`**: si hace falta un color, se agrega como token en `themes/gestion.css`. La excepción son los gráficos (ApexCharts no lee clases), que usan `lib/chart-colors.ts`.

- Semánticos (cambian con el tema): `bg-background`, `bg-card`, `bg-muted`, `text-muted-foreground`, `border-border`, `border-input`, `bg-primary`, `text-destructive`, `bg-sheet-header`, `bg-sidebar`…
- Escalas: `primary-50…900`, `gray-50…900` (arena), `success`/`warning`/`danger`/`info` (50, 100, 300, 500, 600, 700), `violet` (300, 600, 700), `surface-dark-1…4`.
- Texto de estado: positivo `text-success-600 dark:text-success-300`, negativo `text-danger-700 dark:text-danger-300`, advertencia `text-warning-700 dark:text-warning-300`.
- Hover destructivo: `hover:bg-destructive/10 dark:hover:bg-destructive/20`.

## Tipografía

La escala está redefinida en px: `text-xs` 12, `text-sm` 13, `text-base` **14**, `text-md` 16 (no existe en Tailwind), `text-lg` 18, `text-xl` 20, `text-2xl` 26, `text-3xl` 32.

- `h1`–`h6` usan `font-display` por defecto. Un título que no debe serlo (ej. `PageHeader`) lleva `font-body`.
- Números: siempre `tabular-nums`.
- Rótulos en mayúsculas: `text-xs font-semibold uppercase tracking-wide text-muted-foreground`.
- Un `<p>` dentro de un componente compacto necesita `leading-normal` (hereda `leading-[1.8]`).

> **Ojo con los `rem`**: `html` lleva `text-sm md:text-base` (como en Alquilo), así que `1rem` = 13 px en mobile y 14 px en desktop. Las alturas, paddings y radios en `rem` quedan un 12 % más chicos que en Tailwind estándar (`h-9` = 31,5 px). Los tamaños de texto no cambian (están en px). Los breakpoints tampoco (las media queries usan el `rem` del navegador).

## Componentes

**Base** (`@norde/ui/components/...`): `button` (variantes `default`, `secondary`, `outline`, `ghost`, `link`, `destructive`; tamaños `sm`, `default`, `lg`, `icon`, `icon-sm`, `icon-lg`), `input`, `textarea`, `select`, `checkbox`, `switch`, `label`, `form`, `card`, `badge` (+ `success`, `warning`, `info`), `tabs` (pill), `table`, `dialog`, `sheet` (+ `SheetBody`, `SheetFooter`), `tooltip` (invertido), `sonner` (`Toaster` y `toast`), `dropdown-menu` (`modal={false}`), `popover`, `scroll-area`, `skeleton`, `avatar`, `breadcrumb`, `separator`.

**De aplicación**:

| Componente                                                       | Uso                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PageHeader`                                                     | Título de pantalla. El conteo va en el subtítulo ("12 contactos"); las acciones a la derecha, alineadas al pie.                                        |
| `StatusPill` / `SoftBadge`                                       | Estado de entidades de negocio (con punto). Para tablas administrativas, `Badge`.                                                                      |
| `KpiCard`                                                        | Rótulo, valor grande, pie con tono y sparkline opcional.                                                                                               |
| `SectionCard`                                                    | Bloques de una ficha.                                                                                                                                  |
| `ChartCard` + `Chart` / `Sparkline` / `ChartEmpty`               | Gráficos con ApexCharts (solo cliente). Opciones desde `baseChartOptions(isDark)`, memorizadas con `useIsDark()`.                                      |
| `DarkHeader`                                                     | Cabecera de las fichas (propiedad, contrato).                                                                                                          |
| `RowActions` / `RowAction`                                       | Acciones de fila como icon buttons con tooltip. Una acción no disponible se muestra deshabilitada **con el motivo** (`disabledReason`), no se esconde. |
| `TablePagination`                                                | Pie de la tabla. Tamaños `PAGE_SIZES` (listados) o `DETAIL_PAGE_SIZES` (fichas). El tamaño por defecto lo define el contract de la query.              |
| `PagedCombobox` / `PagedMultiSelect`                             | Selector con búsqueda sobre un catálogo paginado en el servidor (de a 20, "Cargar más"). Nunca precargar la lista entera.                              |
| `FileDropzone` / `FileChip`                                      | Carga de archivos.                                                                                                                                     |
| `PasswordInput`                                                  | Contraseña con botón para mostrarla.                                                                                                                   |
| `ErrorState` / `PageLoader`                                      | Error de una ruta (`error.tsx`) y fallback de `Suspense`.                                                                                              |
| `AppShell`, `NavList`, `AccountMenu`, `AppLogo`, `ThemeSwitcher` | Layout privado: sidebar oscuro de 240 px, topbar sticky, menú en panel lateral debajo de `md`.                                                         |
| `PublicLayout`, `AppLogoFull`                                    | Pantallas públicas (ingresar, recuperar contraseña): columna de 420 px, sin card.                                                                      |

`NavList` recibe el link del framework (`linkComponent`) y el `pathname`, así `@norde/ui` no depende de Next.

## Patrones de pantalla

Cada uno tiene su pantalla de ejemplo en `/dev/design-system`.

- **Estructura**: contenedor `flex flex-col gap-5`, primero el `PageHeader`.
- **Listado con tabla** (`listado`): filtros dentro de la card (`border-b`), tabla en `.table-responsive`, `TablePagination` al pie. Siempre tres estados: cargando (skeletons), error (mensaje + "Reintentar") y vacío (distinguiendo "sin datos" de "sin resultados para el filtro"). En mobile, las columnas secundarias se ocultan (`hidden md:table-cell`). El flujo de datos (URL → query del core → página) está en `.claude/skills/gestion-feature/grilla-paginada.md`.
- **Grilla de cards** (`grilla`): filtros fuera de la card con `bg-card` explícito; cards `Link` con `hover:shadow-3xl`.
- **Ficha** (`ficha`): link "← Volver", `DarkHeader` y `SectionCard`s. Las tablas dentro de la ficha paginan de a 5.
- **Alta y edición**: `Sheet` lateral (`sm:max-w-[560px]`), `SheetHeader` + `SheetBody scroll` + pie con Cancelar/Guardar. Formulario con `noValidate` y `contractResolver(<contract del core>)`.
- **Confirmación destructiva**: `Dialog` con Cancelar (`outline`) y la acción (`destructive`).
- **Tablero** (`tablero`): fila de `KpiCard` (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`) y `ChartCard`s.
- **Pantalla pública** (`/dev/ingresar`): `PublicLayout`, encabezado con ícono y botón de envío a ancho completo; errores por toast.
- **Feedback**: éxito y errores de operaciones por toast (arriba al centro); errores de carga de una lista dentro de la card; errores de campo con `FormMessage` y borde rojo (`aria-invalid`).

## Formato

- Montos (`formatMoney`): `$ 420.000`, `US$ 1.500`, `-$ 1.000`, sin decimales. Desde `MoneyDto` (centavos en `bigint`), sin pasar por `number`.
- Ejes de gráficos (`formatMoneyCompact`): `$ 1,3 M`, `$ 45 mil`.
- Fechas: `formatDate` (instante UTC → "30 sept 2026" en Buenos Aires), `formatDateTime` (con hora en 24 h), `formatDateOnly` ("YYYY-MM-DD" → "01/10/2026", sin correr el día), `formatPeriod` ("Septiembre 2026", "sep 2026").
- Valor vacío: `—` (`EMPTY_VALUE`). Texto truncado: con `title` con el texto completo.

## Iconos

Solo `lucide-react`. Tamaños: `h-4 w-4` (botones, menú, tablas), `h-5 w-5` (título de pantalla, ícono de card), `h-6 w-6` (`DarkHeader`, dropzone), `h-8 w-8` (pantalla de error). Decorativos con `aria-hidden` y en `text-muted-foreground`.

## Accesibilidad

- Foco visible siempre: anillo de 3 px `ring-ring/50`.
- Botones solo-ícono con `aria-label` (y tooltip).
- Toggles con `aria-pressed`; el label nombra la **acción** ("Cambiar a oscuro").
- Item activo del menú con `aria-current="page"`; contadores con `aria-label` descriptivo.
- `Sheet` y `Dialog` siempre con título y descripción (con `sr-only` si no se muestran).
- Animaciones de skeleton respetan `prefers-reduced-motion`.

## Pendiente

- **Identidad de Norde**: el isotipo es provisorio y la paleta es la de Alquilo. Cuando estén el logo y el color de marca, se reemplazan siguiendo el ADR 0012.
- **Grilla con TanStack Table**: el componente de grilla común lo define la sub-issue #2; `Table` y `TablePagination` son la capa visual que va a usar.
