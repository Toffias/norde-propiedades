import { Button } from '@norde/ui/components/button';
import { PageHeader } from '@norde/ui/components/page-header';
import { SectionCard } from '@norde/ui/components/section-card';
import { KeyRoundIcon, UserRoundIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { TwoFactorSettings } from '../../../features/identity/components/two-factor-settings';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Mi cuenta' };

// La seguridad de la cuenta propia: contraseña y verificación en dos pasos (#113). Cualquier
// usuario entra; no pide permisos.
export default async function AccountPage() {
  const { profile } = await requireSession();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader icon={UserRoundIcon} title="Mi cuenta" subtitle={profile.email} />
      <SectionCard
        title="Contraseña"
        icon={KeyRoundIcon}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/cambiar-contrasena">Cambiar</Link>
          </Button>
        }
      >
        <p className="text-sm leading-normal text-muted-foreground">
          La que usás para ingresar al panel. Si te la olvidás, un administrador te la puede
          blanquear.
        </p>
      </SectionCard>
      <TwoFactorSettings enabled={profile.twoFactorEnabled} />
    </div>
  );
}
