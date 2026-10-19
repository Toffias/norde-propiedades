import { initials } from '@norde/ui/lib/initials';
import { cn } from '@norde/ui/lib/utils';

/**
 * Las iniciales del contacto en un cuadradito: se reconoce de un vistazo. Por defecto, del alto del
 * nombre más su badge (oportunidades); en una grilla, más chico.
 */
export function ContactInitials({
  name,
  className,
}: {
  readonly name: string;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-[2.9rem] shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
