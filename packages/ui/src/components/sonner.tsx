'use client';

import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Las apps disparan toasts con este `toast` (así no dependen de sonner directamente). */
export { toast } from 'sonner';

/**
 * Toaster arriba al centro. El toast va siempre sobre superficie clara: en oscuro se invierte
 * (tokens `--toast-*` del tema) para que interrumpa y no se confunda con una card.
 * Sonner pinta con sus propias variables (`--normal-*`), por eso se mapean acá.
 */
const toasterStyle: CSSProperties & Record<`--${string}`, string> = {
  zIndex: 'var(--z-toast)',
  '--normal-bg': 'var(--toast)',
  '--normal-text': 'var(--toast-foreground)',
  '--normal-border': 'var(--toast-border)',
  '--border-radius': 'var(--radius)',
};

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      style={toasterStyle}
      toastOptions={{
        classNames: {
          toast: 'font-body shadow-lg',
          description: '!text-(--toast-muted)',
          actionButton: '!bg-primary !text-primary-foreground',
          cancelButton: '!bg-muted !text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
