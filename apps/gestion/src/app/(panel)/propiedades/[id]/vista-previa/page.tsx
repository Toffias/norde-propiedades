import { Badge } from '@norde/ui/components/badge';
import { Card } from '@norde/ui/components/card';
import { SectionCard } from '@norde/ui/components/section-card';
import { EyeIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getContainer } from '../../../../../container';
import {
  FEATURE_KIND_LABELS,
  OPERATION_LABELS,
  PROPERTY_TYPE_LABELS,
} from '../../../../../features/properties/labels';
import { formatMoney } from '../../../../../lib/format';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Vista previa' };

/** Fotos que muestra la vista previa: las de la web, en orden. */
const PREVIEW_PHOTOS = 12;

const OPERATION_NAMES: Readonly<Record<string, string>> = OPERATION_LABELS;
const TYPE_NAMES: Readonly<Record<string, string>> = PROPERTY_TYPE_LABELS;
const FEATURE_KIND_NAMES: Readonly<Record<string, string>> = FEATURE_KIND_LABELS;

/**
 * Cómo se vería la propiedad en el sitio: las fotos marcadas para la web, la dirección para publicar
 * (o la exacta, si se habilitó) y el precio según la publicación. Funciona aunque no esté publicada.
 */
export default async function PropertyPreviewPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { actor } = await requireSession();
  const { id } = await params;
  const { properties } = getContainer();
  const [result, gallery] = await Promise.all([
    properties.getPanelPropertyDetail.execute({ propertyId: id }, actor),
    properties.listPropertyMedia.execute({ propertyId: id, kind: 'images', pageSize: 100 }, actor),
  ]);
  if (result.isErr()) notFound();
  const detail = result.value;
  const photos = (gallery.isOk() ? gallery.value.items : [])
    .filter((item) => item.showOnWeb && item.kind === 'photo' && item.processing !== 'failed')
    .slice(0, PREVIEW_PHOTOS);
  const { publication, characteristics: c } = detail;
  const address = publication.showExactAddress
    ? [detail.address.street, detail.address.streetNumber].filter(Boolean).join(' ')
    : detail.publishAddress;
  const facts = [
    c.rooms === undefined ? undefined : `${c.rooms.toString()} ambientes`,
    c.bedrooms === undefined ? undefined : `${c.bedrooms.toString()} dormitorios`,
    c.bathrooms === undefined ? undefined : `${c.bathrooms.toString()} baños`,
    c.parkingSpaces === undefined ? undefined : `${c.parkingSpaces.toString()} cocheras`,
    c.surfaceTotalM2 === undefined
      ? undefined
      : `${c.surfaceTotalM2.toLocaleString('es-AR')} m² totales`,
    c.surfaceCoveredM2 === undefined
      ? undefined
      : `${c.surfaceCoveredM2.toLocaleString('es-AR')} m² cubiertos`,
  ].filter((part) => part !== undefined);
  const [cover, ...rest] = photos;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div
        role="status"
        className="flex items-start gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm"
      >
        <EyeIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Vista previa: así se vería en el sitio de Norde.{' '}
          {detail.isPubliclyListed
            ? 'Está publicada.'
            : 'Hoy no se muestra: tiene que estar disponible y marcada "Publicar en web".'}
        </span>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        {cover === undefined ? (
          <div className="flex aspect-[16/7] items-center justify-center bg-muted text-sm text-muted-foreground">
            Sin fotos para la web
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- la sirve una ruta autorizada del panel
          <img
            src={`/propiedades/${detail.id}/fotos/${cover.id}?v=web`}
            alt={cover.description ?? detail.portalTitle}
            className="aspect-[16/7] w-full object-cover"
          />
        )}
        {rest.length > 0 && (
          <div className="grid grid-cols-3 gap-1 p-1 sm:grid-cols-6">
            {rest.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element -- la sirve una ruta autorizada del panel
              <img
                key={photo.id}
                src={`/propiedades/${detail.id}/fotos/${photo.id}?v=thumbnail`}
                alt={photo.description ?? ''}
                className="aspect-[4/3] w-full rounded object-cover"
              />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 p-5">
          <p className="text-sm text-muted-foreground">
            {TYPE_NAMES[detail.propertyType] ?? detail.propertyType} · {address} ·{' '}
            {detail.address.neighborhood}
          </p>
          <h1 className="text-2xl font-extrabold">{detail.portalTitle}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {detail.operations.map((operation) => (
              <p key={operation.operation} className="text-lg font-semibold tabular-nums">
                {OPERATION_NAMES[operation.operation] ?? operation.operation}:{' '}
                {publication.showPriceOnWeb &&
                !operation.priceOnRequest &&
                operation.priceCents !== undefined
                  ? formatMoney({ amountCents: operation.priceCents, currency: operation.currency })
                  : 'Consultar precio'}
              </p>
            ))}
          </div>
          {facts.length > 0 && <p className="text-sm">{facts.join(' · ')}</p>}
        </div>
      </Card>

      {detail.description !== '' && (
        <SectionCard title="Descripción">
          <p className="text-sm whitespace-pre-line">{detail.description}</p>
        </SectionCard>
      )}
      {detail.features.length > 0 && (
        <SectionCard title="Comodidades">
          <div className="flex flex-col gap-3">
            {(['service', 'room', 'amenity'] as const).map((kind) => {
              const items = detail.features.filter((feature) => feature.kind === kind);
              if (items.length === 0) return null;
              return (
                <div key={kind} className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">{FEATURE_KIND_NAMES[kind]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((feature) => (
                      <Badge key={feature.id} variant="secondary">
                        {feature.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
