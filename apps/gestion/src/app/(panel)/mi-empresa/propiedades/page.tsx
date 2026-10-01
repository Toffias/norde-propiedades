import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { GridColumnsForm } from '../../../../features/properties/components/grid-columns-form';
import { PropertyTypesSettings } from '../../../../features/properties/components/property-types-settings';
import { messageForError } from '../../../../lib/errors';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Configuración de propiedades' };

export default async function PropertySettingsPage() {
  const { actor } = await requireSession();
  const result = await getContainer().properties.getPropertyConfiguration.execute(actor);
  if (result.isErr()) {
    return (
      <ErrorState title="No podés ver esta sección" description={messageForError(result.error)} />
    );
  }
  const disabled = !actor.can('settings:update');

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Columnas del buscador">
        <GridColumnsForm columns={result.value.gridColumns} disabled={disabled} />
      </SectionCard>
      <SectionCard title="Tipos de propiedad">
        <PropertyTypesSettings types={result.value.types} disabled={disabled} />
      </SectionCard>
    </div>
  );
}
