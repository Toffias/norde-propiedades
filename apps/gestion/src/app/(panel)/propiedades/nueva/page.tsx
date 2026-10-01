import { Button } from '@norde/ui/components/button';
import { PageHeader } from '@norde/ui/components/page-header';
import { ArrowLeftIcon, BuildingIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { NewPropertyForm } from '../../../../features/properties/components/new-property-form';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Nueva propiedad' };

export default async function NewPropertyPage() {
  const { actor } = await requireSession();
  // Solo evita mostrar un formulario que no se va a poder guardar: el caso de uso vuelve a verificar.
  if (!actor.can('properties:create')) redirect('/propiedades');

  return (
    <div className="flex flex-col gap-5">
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href="/propiedades">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver a las propiedades
        </Link>
      </Button>
      <PageHeader
        icon={BuildingIcon}
        title="Nueva propiedad"
        subtitle="Alta corta: lo indispensable para tenerla en la cartera. El resto se completa en la ficha."
      />
      <NewPropertyForm />
    </div>
  );
}
