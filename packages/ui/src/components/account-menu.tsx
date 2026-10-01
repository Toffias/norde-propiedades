'use client';

import { LogOutIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { initials } from '../lib/initials';
import { Avatar, AvatarFallback } from './avatar';
import { Badge } from './badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface AccountMenuProps {
  readonly name: string;
  readonly email: string;
  readonly roles?: readonly string[];
  /** Items extra (DropdownMenuItem) entre los datos de la cuenta y "Cerrar sesión". */
  readonly children?: ReactNode;
  readonly onSignOut: () => void;
}

export function AccountMenu({ name, email, roles = [], children, onSignOut }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menú de la cuenta"
        className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs font-semibold">{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1 font-normal">
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Cuenta</span>
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
          {roles.length > 0 && (
            <span className="flex flex-wrap gap-1 pt-1">
              {roles.map((role) => (
                <Badge key={role} variant="secondary" className="font-normal">
                  {role}
                </Badge>
              ))}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
        {children !== undefined && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOutIcon className="h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
