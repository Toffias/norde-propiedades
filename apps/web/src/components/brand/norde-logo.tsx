import { cn } from '@norde/ui/lib/utils';

/**
 * Wordmark de Norde: "NORDE" en serif ancha roja sobre "PROPIEDADES" entre dos líneas
 * escalonadas, como el logo original pero dibujado con texto (nítido en cualquier tamaño).
 */
export function NordeLogo({ className }: { readonly className?: string }) {
  return (
    <span className={cn('inline-flex flex-col items-center leading-none', className)}>
      <span className="font-wordmark text-brand-600 dark:text-brand-400 text-[1.45em] font-bold tracking-[0.22em]">
        NORDE
      </span>
      <span className="text-ink mt-[0.3em] flex w-full items-center gap-[0.5em] text-[0.42em] font-semibold tracking-[0.42em]">
        <span aria-hidden className="deco-steps h-[5px] flex-1" />
        PROPIEDADES
        <span aria-hidden className="deco-steps h-[5px] flex-1" />
      </span>
    </span>
  );
}
