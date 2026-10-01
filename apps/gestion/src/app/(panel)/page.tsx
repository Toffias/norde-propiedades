import { PageHeader } from '@norde/ui/components/page-header';
import { HomeIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { requireSession } from '../../lib/session';

export const metadata: Metadata = { title: 'Inicio' };

// Los pendientes y el estado actual llegan con #15.
export default async function HomePage() {
  const { profile } = await requireSession();
  const firstName = profile.name.split(' ')[0] ?? profile.name;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={HomeIcon}
        title={`Hola, ${firstName}`}
        subtitle="Panel de gestión de Norde"
      />
      <p className="text-sm leading-normal text-muted-foreground">
        Los módulos se van habilitando en el menú a medida que estén listos.
      </p>
    </div>
  );
}
