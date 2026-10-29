'use client';

import { useRouter } from 'next/navigation';

import { SiteSelect } from '../forms/site-select';

interface SortSelectProps {
  readonly options: readonly { readonly label: string; readonly href: string }[];
  readonly selectedHref: string;
}

/**
 * Orden del listado: cambia la URL al elegir. Cada opción trae su link armado en el servidor
 * (sin JavaScript, el orden se elige con los filtros).
 */
export function SortSelect({ options, selectedHref }: SortSelectProps) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground font-medium whitespace-nowrap">Ordenar por</span>
      <div className="w-44">
        <SiteSelect
          // Al cambiar un filtro cambian los links del orden: se vuelve a montar con el valor nuevo.
          key={selectedHref}
          aria-label="Ordenar por"
          defaultValue={selectedHref}
          onValueChange={(href) => {
            router.push(href);
          }}
          options={options.map((option) => ({ value: option.href, label: option.label }))}
          className="h-10!"
        />
      </div>
    </div>
  );
}
