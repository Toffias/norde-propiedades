import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * La parte destacada de un título ("Propiedades *destacadas*"): serif en itálica, en el rojo de la
 * marca y apenas más grande. Va después de un espacio
 * común (así el texto se lee bien en lectores de pantalla y buscadores), con el tracking ajustado del título.
 */
export function TitleAccent({ children }: { readonly children: ReactNode }) {
  return (
    <span className="font-accent text-primary ms-[0.02em] text-[1.12em] font-normal tracking-normal italic">
      {children}
    </span>
  );
}

interface SectionHeadingProps {
  readonly id: string;
  readonly title: string;
  /** El final del título, destacado (ver `TitleAccent`). */
  readonly accent?: string;
  readonly description?: ReactNode;
  readonly link?: { readonly href: string; readonly label: string };
}

/** Título de sección, con el final destacado y, opcional, un "ver todo". */
export function SectionHeading({ id, title, accent, description, link }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl space-y-1">
        <h2 id={id} className="text-3xl font-extrabold sm:text-4xl">
          {title}
          {accent && (
            <>
              {' '}
              <TitleAccent>{accent}</TitleAccent>
            </>
          )}
        </h2>
        {description && (
          <p className="text-muted-foreground text-[0.9375rem] italic">{description}</p>
        )}
      </div>
      {link && (
        <Link
          href={link.href}
          className="text-primary link-underline inline-flex items-center gap-1 text-sm font-bold"
        >
          {link.label}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}
