import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Pantalla de error de una ruta (error boundary). El título usa `text-base`, como el resto de los
 * títulos de pantalla. `actions`: "Reintentar" (primario) e "Ir al inicio" (`outline`).
 */
export function ErrorState({
  title = 'Algo salió mal',
  description = 'No pudimos cargar esta pantalla. Probá de nuevo en unos segundos.',
  actions,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangleIcon className="h-8 w-8 text-destructive" aria-hidden />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <h1 className="font-body text-base font-semibold">{title}</h1>
        <p className="text-sm leading-normal text-muted-foreground">{description}</p>
      </div>
      {actions !== undefined && (
        <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/** Fallback de Suspense de una ruta. */
export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16" role="status">
      <span className="sr-only">Cargando…</span>
      <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}
