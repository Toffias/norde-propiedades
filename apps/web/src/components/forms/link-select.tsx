'use client';

import { cn } from '@norde/ui/lib/utils';
import { useRouter } from 'next/navigation';

import { SiteSelect } from './site-select';

interface LinkSelectProps {
  /** Para el lector de pantalla: el select muestra la opción elegida, no la etiqueta. */
  readonly label: string;
  readonly options: readonly { readonly label: string; readonly href: string }[];
  readonly selectedHref: string;
  readonly className?: string;
}

/**
 * Un filtro de listado como desplegable: cada opción es un link armado en el servidor y elegirla
 * navega a esa URL (los filtros quedan en la URL, se pueden compartir).
 */
export function LinkSelect({ label, options, selectedHref, className }: LinkSelectProps) {
  const router = useRouter();

  return (
    <div className={cn('w-44', className)}>
      <SiteSelect
        // Al cambiar otro filtro cambian los links de este: se vuelve a montar con el valor nuevo.
        key={selectedHref}
        aria-label={label}
        defaultValue={selectedHref}
        onValueChange={(href) => {
          router.push(href);
        }}
        options={options.map((option) => ({ value: option.href, label: option.label }))}
        className="h-10!"
      />
    </div>
  );
}
