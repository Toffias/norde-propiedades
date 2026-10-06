import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface SectionHeadingProps {
  readonly id: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly link?: { readonly href: string; readonly label: string };
}

/** Título de sección con la línea escalonada del logo debajo y, opcional, un "ver todo". */
export function SectionHeading({ id, title, description, link }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl space-y-3">
        <h2 id={id} className="text-2xl font-extrabold sm:text-3xl">
          {title}
        </h2>
        <div aria-hidden className="deco-steps-sm" />
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {link && (
        <Link
          href={link.href}
          className="text-primary inline-flex items-center gap-1 text-sm font-bold hover:underline"
        >
          {link.label}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}
