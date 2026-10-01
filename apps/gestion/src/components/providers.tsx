'use client';

import { ThemeProvider } from '@norde/ui/components/theme-provider';
import { Toaster } from '@norde/ui/components/sonner';
import { TooltipProvider } from '@norde/ui/components/tooltip';
import type { ReactNode } from 'react';

import { configureZodMessages } from '../lib/zod-messages';

configureZodMessages();

/** Proveedores de cliente del panel: tema (claro por defecto, sin "sistema"), tooltips y toasts. */
export function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="light" enableSystem={false} storageKey="norde-gestion-theme">
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
