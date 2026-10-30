'use client';

import type { PropertyStatusValue, PropertyType } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@norde/ui/components/dialog';
import { Skeleton } from '@norde/ui/components/skeleton';
import { StatusPill } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState, type KeyboardEvent } from 'react';

import { EMPTY_VALUE, formatMoney } from '../../../lib/format';
import { loadPropertyQuickViewAction, type PropertyQuickView } from '../actions';
import { OPERATION_LABELS, PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../labels';
import { userName } from '../property-format';
import { FallbackImage } from './property-photo';

type Loaded =
  | { readonly ok: true; readonly value: PropertyQuickView }
  | { readonly ok: false; readonly message: string };

type Detail = PropertyQuickView['detail'];

function isPropertyType(value: string): value is PropertyType {
  return value in PROPERTY_TYPE_LABELS;
}

function isStatus(value: string): value is PropertyStatusValue {
  return value in PROPERTY_STATUS_DISPLAY;
}

function photoUrl(propertyId: string, mediaId: string, variant: 'web' | 'thumbnail'): string {
  return `/propiedades/${propertyId}/fotos/${mediaId}?v=${variant}`;
}

const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

function count(value: number | undefined, unit = ''): string | undefined {
  return value === undefined ? undefined : `${numberFormat.format(value)}${unit}`;
}

/** Los datos clave que tienen valor: los vacíos no ocupan lugar en el vistazo. */
function keyFacts(detail: Detail): readonly { readonly label: string; readonly value: string }[] {
  const c = detail.characteristics;
  const facts: readonly { readonly label: string; readonly value: string | undefined }[] = [
    { label: 'Ambientes', value: count(c.rooms) },
    { label: 'Dormitorios', value: count(c.bedrooms) },
    { label: 'Baños', value: count(c.bathrooms) },
    { label: 'Cocheras', value: count(c.parkingSpaces) },
    { label: 'Sup. total', value: count(c.surfaceTotalM2, ' m²') },
    { label: 'Sup. cubierta', value: count(c.surfaceCoveredM2, ' m²') },
    { label: 'Terreno', value: count(c.surfaceLandM2, ' m²') },
    {
      label: 'Antigüedad',
      value:
        c.ageYears === undefined
          ? undefined
          : c.ageYears === 0
            ? 'A estrenar'
            : `${c.ageYears} años`,
    },
    {
      label: 'Captador',
      value: detail.producer === undefined ? undefined : userName(detail.producer),
    },
    { label: 'Emprendimiento', value: detail.development?.name },
  ];
  return facts.flatMap((fact) =>
    fact.value === undefined ? [] : [{ label: fact.label, value: fact.value }],
  );
}

/**
 * "Palermo, CABA": de lo más cercano a lo más general, sin el país. Sin repetir un nombre
 * (la provincia y la ciudad de CABA se llaman igual).
 */
function placeOf(detail: Detail): string {
  const names = detail.locationPath.slice(1).map((level) => level.name);
  return [...new Set(names)].reverse().join(', ');
}

function Carousel({
  propertyId,
  photoIds,
  totalPhotos,
  title,
}: {
  readonly propertyId: string;
  readonly photoIds: readonly string[];
  readonly totalPhotos: number;
  readonly title: string;
}) {
  const [index, setIndex] = useState(0);
  const current = photoIds[index];
  const empty = (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <HomeIcon className="size-10" aria-hidden />
      <span className="sr-only">Sin fotos</span>
    </div>
  );

  function go(step: number) {
    setIndex((value) => (value + step + photoIds.length) % photoIds.length);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (photoIds.length < 2) return;
    if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === 'ArrowRight') go(1);
    else return;
    event.preventDefault();
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-roledescription="carrusel"
        aria-label={`Fotos de ${title}`}
        tabIndex={photoIds.length > 1 ? 0 : -1}
        onKeyDown={onKeyDown}
        className="relative aspect-[16/10] overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {current === undefined ? (
          empty
        ) : (
          <FallbackImage
            key={current}
            src={photoUrl(propertyId, current, 'web')}
            alt={`Foto ${index + 1} de ${photoIds.length}`}
            className="absolute inset-0 h-full w-full object-cover"
            fallback={empty}
          />
        )}
        {photoIds.length > 1 && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Foto anterior"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-card/90 shadow-sm"
              onClick={() => {
                go(-1);
              }}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Foto siguiente"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-card/90 shadow-sm"
              onClick={() => {
                go(1);
              }}
            >
              <ChevronRightIcon />
            </Button>
            <span
              aria-live="polite"
              className="absolute right-2 bottom-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums"
            >
              {index + 1} / {photoIds.length}
            </span>
          </>
        )}
      </div>
      {photoIds.length > 1 && (
        <ul className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Miniaturas">
          {photoIds.map((mediaId, position) => (
            <li key={mediaId} className="shrink-0">
              <button
                type="button"
                aria-label={`Ver foto ${position + 1}`}
                aria-current={position === index}
                onClick={() => {
                  setIndex(position);
                }}
                className={cn(
                  'block size-12 overflow-hidden rounded-md border-2 bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  position === index
                    ? 'border-primary'
                    : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <FallbackImage
                  key={mediaId}
                  src={photoUrl(propertyId, mediaId, 'thumbnail')}
                  className="h-full w-full object-cover"
                  fallback={<span className="block h-full w-full" />}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {totalPhotos > photoIds.length && (
        <p className="text-xs text-muted-foreground">
          Mostramos {photoIds.length} de {totalPhotos}. El resto, en la ficha.
        </p>
      )}
    </div>
  );
}

function Description({ text }: { readonly text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text === '') return <p className="text-sm text-muted-foreground">Sin descripción todavía.</p>;
  // A ojo: con más de ~400 caracteres, el recorte de 5 líneas se come parte del texto.
  const long = text.length > 400 || text.split('\n').length > 5;
  return (
    <div className="flex flex-col items-start gap-1">
      <p className={cn('text-sm whitespace-pre-line', !expanded && 'line-clamp-5')}>{text}</p>
      {long && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </Button>
      )}
    </div>
  );
}

function QuickViewBody({ value }: { readonly value: PropertyQuickView }) {
  const { detail } = value;
  const status = isStatus(detail.status) ? PROPERTY_STATUS_DISPLAY[detail.status] : undefined;
  const type = isPropertyType(detail.propertyType)
    ? PROPERTY_TYPE_LABELS[detail.propertyType]
    : detail.propertyType;
  const place = placeOf(detail);
  const facts = keyFacts(detail);

  return (
    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Carousel
        propertyId={detail.id}
        photoIds={value.photoIds}
        totalPhotos={value.totalPhotos}
        title={detail.portalTitle}
      />
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground tabular-nums">
            {status !== undefined && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
            <span>
              {detail.code} · {type}
            </span>
          </div>
          <DialogTitle className="text-lg leading-snug">{detail.portalTitle}</DialogTitle>
          <DialogDescription>
            {[detail.publishAddress, place].filter((part) => part !== '').join(' · ') ||
              EMPTY_VALUE}
          </DialogDescription>
        </div>

        {detail.operations.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {detail.operations.map((operation) => (
              <li
                key={operation.operation}
                className="flex flex-col rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <span className="text-xs text-muted-foreground">
                  {OPERATION_LABELS[operation.operation]}
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {operation.priceCents === undefined
                    ? 'Sin precio cargado'
                    : formatMoney({
                        amountCents: operation.priceCents,
                        currency: operation.currency,
                      })}
                </span>
                {operation.priceOnRequest && (
                  <span className="text-xs text-muted-foreground">A consultar en la web</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="truncate text-sm font-medium tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex flex-col gap-1">
          <h3 className="text-xs text-muted-foreground">Descripción</h3>
          <Description text={detail.description} />
        </div>
      </div>
    </div>
  );
}

function QuickViewSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" aria-busy>
      <Skeleton className="aspect-[16/10] w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-3 h-16 w-48" />
        <Skeleton className="mt-3 h-20 w-full" />
      </div>
    </div>
  );
}

/**
 * El vistazo de una propiedad del buscador: fotos, datos clave y descripción, sin salir de la
 * grilla. Se monta con `key={propertyId}`: cada propiedad arranca de cero.
 */
export function PropertyQuickViewDialog({
  propertyId,
  onClose,
}: {
  readonly propertyId: string;
  readonly onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | undefined>();
  const href = `/propiedades/${propertyId}` as Route;

  useEffect(() => {
    let active = true;
    void loadPropertyQuickViewAction({ propertyId }).then((result) => {
      if (active) setLoaded(result);
    });
    return () => {
      active = false;
    };
  }, [propertyId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-2xl md:max-w-4xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {loaded === undefined ? (
            <>
              <DialogTitle className="sr-only">Cargando propiedad</DialogTitle>
              <DialogDescription className="sr-only">Vistazo de la propiedad</DialogDescription>
              <QuickViewSkeleton />
            </>
          ) : loaded.ok ? (
            <QuickViewBody value={loaded.value} />
          ) : (
            <div className="flex flex-col gap-1">
              <DialogTitle>No pudimos abrir la propiedad</DialogTitle>
              <DialogDescription>{loaded.message}</DialogDescription>
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button asChild>
            <Link href={href}>
              Ver ficha completa
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
