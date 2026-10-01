'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

import { useIsClient } from '../lib/use-is-client';
import { cn } from '../lib/utils';
import { Button } from './button';

/** Alterna claro/oscuro. El `aria-label` nombra la acción, no el estado. */
export function ThemeSwitcher({ className }: { readonly className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();
  const isDark = isClient && resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('px-2', className)}
      aria-pressed={isDark}
      aria-label={isDark ? 'Cambiar a claro' : 'Cambiar a oscuro'}
      title={isDark ? 'Cambiar a claro' : 'Cambiar a oscuro'}
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark');
      }}
    >
      {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </Button>
  );
}
