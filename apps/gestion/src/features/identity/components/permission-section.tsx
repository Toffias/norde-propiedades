import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Un grupo del catálogo de permisos, colapsable para recorrer los demás sin scrollear todo. El
 * resumen ("3 de 12") se ve también con el grupo cerrado.
 */
export function PermissionSection({
  label,
  summary,
  defaultOpen = false,
  children,
}: {
  readonly label: string;
  readonly summary: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group shrink-0 rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 select-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold">{label}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {summary}
          <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-border px-4 py-3">{children}</div>
    </details>
  );
}
