'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** `'system'` sigue al sistema operativo (requiere `enableSystem`). */
  readonly defaultTheme?: 'light' | 'dark' | 'system';
  readonly enableSystem?: boolean;
  /** Clave de localStorage. Cada app usa la suya para no pisarse en el mismo dominio. */
  readonly storageKey?: string;
}

/**
 * Tema claro/oscuro con el atributo `data-theme` en `<html>`. next-themes inyecta un script que
 * aplica el tema guardado antes del primer paint (sin flash). El `<html>` de la app necesita
 * `suppressHydrationWarning`.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
  enableSystem = true,
  storageKey = 'theme',
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      storageKey={storageKey}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
