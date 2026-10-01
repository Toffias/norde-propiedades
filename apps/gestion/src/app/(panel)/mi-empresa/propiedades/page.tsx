import { ListCustomAttributesQuerySchema } from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { CustomAttributesSettings } from '../../../../features/properties/components/custom-attributes-settings';
import { GridColumnsForm } from '../../../../features/properties/components/grid-columns-form';
import { PropertyTypesSettings } from '../../../../features/properties/components/property-types-settings';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Configuración de propiedades' };

export default async function PropertySettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(ListCustomAttributesQuerySchema, await searchParams);
  const { properties } = getContainer();
  const [result, attributes] = await Promise.all([
    properties.getPropertyConfiguration.execute(actor),
    properties.listCustomAttributes.execute(query, actor),
  ]);
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
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-bold">Atributos personalizados</h2>
        <p className="text-sm text-muted-foreground">
          Datos que Norde agrega a la ficha además de los estándar (ej. &quot;Vista al río&quot;).
        </p>
        <Card className="gap-0 overflow-hidden p-0">
          {attributes.isErr() ? (
            <ErrorState
              title="No pudimos cargar los atributos"
              description={messageForError(attributes.error)}
            />
          ) : (
            <CustomAttributesSettings page={attributes.value} disabled={disabled} />
          )}
        </Card>
      </div>
    </div>
  );
}
