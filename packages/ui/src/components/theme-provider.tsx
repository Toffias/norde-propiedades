'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Tema claro/oscuro con el atributo `data-theme` en `<html>` (sigue al sistema por defecto).
 * El `<html>` de la app necesita `suppressHydrationWarning`.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
