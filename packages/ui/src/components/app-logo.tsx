import { cn } from '../lib/utils';

const BRAND_NAME = 'Norde';
const BRAND_TAGLINE = 'Gestión';

/**
 * Isotipo provisorio de Norde: cuadrado rojo de marca con una "N" blanca. Un solo dibujo para los
 * dos temas. Se reemplaza cuando esté la identidad de Norde (docs/modulos/02-web-diseno-seo.md).
 */
export function AppIsotype({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden className={cn('shrink-0', className)}>
      <rect x="81" y="81" width="862" height="862" rx="207.5" className="fill-primary-500" />
      <path d="M300 724V300H404L620 578V300H724V724H620L404 446V724Z" className="fill-white" />
    </svg>
  );
}

export interface AppLogoProps {
  /** `compact`: solo isotipo (28 px). `bar`: isotipo 32 px + wordmark (sidebar). */
  readonly variant?: 'compact' | 'bar';
  /** Sobre el sidebar oscuro: wordmark blanco y bajada clara, en los dos temas. */
  readonly onSidebar?: boolean;
  readonly className?: string;
}

export function AppLogo({ variant = 'bar', onSidebar = false, className }: AppLogoProps) {
  if (variant === 'compact') {
    return (
      <span className={cn('inline-flex', className)}>
        <AppIsotype className="h-7 w-7" />
        <span className="sr-only">{BRAND_NAME}</span>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <AppIsotype className="h-8 w-8" />
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            'font-display text-lg leading-tight font-semibold tracking-tight',
            onSidebar ? 'text-white' : 'text-black dark:text-white',
          )}
        >
          {BRAND_NAME}
        </span>
        <span
          className={cn(
            'text-xs leading-tight',
            onSidebar ? 'text-sidebar-foreground/70' : 'text-muted-foreground',
          )}
        >
          {BRAND_TAGLINE}
        </span>
      </span>
    </span>
  );
}

/** Isotipo 64 px y wordmark apilados, para el layout público. */
export function AppLogoFull({ className }: { readonly className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <AppIsotype className="h-16 w-16" />
      <span className="font-display text-3xl leading-none font-semibold tracking-tight text-black dark:text-white">
        {BRAND_NAME}
      </span>
    </div>
  );
}
