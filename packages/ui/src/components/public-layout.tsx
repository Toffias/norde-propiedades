import type { ReactNode } from 'react';

import { AppLogoFull } from './app-logo';
import { ThemeSwitcher } from './theme-switcher';

/**
 * Layout de las pantallas públicas (ingresar, recuperar contraseña): columna angosta centrada,
 * sin card. El header es absoluto a propósito: si ocupara alto, el centro óptico de la columna se
 * correría hacia abajo.
 */
export function PublicLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col">
      <header className="absolute inset-x-0 top-0 flex items-center justify-end px-4 py-4 md:px-6">
        <ThemeSwitcher />
      </header>
      <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-4 py-16">
        <AppLogoFull className="mx-auto mb-8" />
        {children}
      </main>
    </div>
  );
}
