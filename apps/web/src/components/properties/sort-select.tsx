'use client';

import { useRouter } from 'next/navigation';

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
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground font-medium">Ordenar por</span>
      <select
        value={selectedHref}
        onChange={(event) => {
          router.push(event.target.value);
        }}
        className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-xl border px-3 font-semibold outline-none focus-visible:ring-[3px]"
      >
        {options.map((option) => (
          <option key={option.href} value={option.href}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
