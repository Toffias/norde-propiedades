'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

import type { NavGroup } from '../../lib/layout/site-nav';

/** Un grupo del menú principal (desktop): se abre con clic o teclado y navega con links reales. */
export function NavDropdown({
  group,
  className,
}: {
  readonly group: NavGroup;
  readonly className: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${className} group focus-visible:ring-ring/50 data-[state=open]:text-foreground inline-flex items-center gap-1 outline-none focus-visible:ring-[3px]`}
      >
        {group.label}
        <ChevronDown
          aria-hidden
          className="size-4 transition-transform group-data-[state=open]:rotate-180"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56 rounded-2xl p-2 shadow-lg">
        {group.items.map((item) => (
          <DropdownMenuItem
            key={item.href}
            asChild
            className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
          >
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
