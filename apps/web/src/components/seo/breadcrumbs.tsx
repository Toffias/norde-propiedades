import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { breadcrumbSchema, type BreadcrumbItem } from '../../lib/seo/json-ld';
import { getSiteUrl } from '../../lib/site-url';
import { JsonLdScript } from './json-ld-script';

/** Migas de pan visibles + `BreadcrumbList`. El último ítem es la página actual. */
export function Breadcrumbs({ items }: { readonly items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Migas de pan" className="text-muted-foreground text-sm">
      <JsonLdScript data={breadcrumbSchema(getSiteUrl(), items)} />
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-1">
              {isLast ? (
                <span aria-current="page" className="text-foreground line-clamp-1">
                  {item.name}
                </span>
              ) : (
                <>
                  <Link href={item.path} className="hover:text-foreground transition-colors">
                    {item.name}
                  </Link>
                  <ChevronRight aria-hidden className="size-3.5" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
