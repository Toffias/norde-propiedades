'use client';

import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { Skeleton } from '@norde/ui/components/skeleton';
import { StatusPill } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import { ExternalLinkIcon, FileTextIcon, ImageIcon, LayoutListIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatCount, formatDateOnly } from '../../../lib/format';
import { mediaFileHref } from '../../media/paths';
import { FormAlert } from '../../shared/components/form-alert';
import { loadDevelopmentQuickViewAction, type DevelopmentQuickView } from '../actions';
import {
  CONSTRUCTION_STATUS_LABELS,
  DEVELOPMENT_STATUS_DISPLAY,
  DEVELOPMENT_TYPE_LABELS,
} from '../labels';
import { DevelopmentFavoriteToggle } from './development-favorite-toggle';
import { ExportUnitsButton } from './export-units-button';

/** Lo que trajo el pedido de un emprendimiento; mientras no llega, se muestra cargando. */
type Loaded = { readonly developmentId: string } & (
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'ready'; readonly view: DevelopmentQuickView }
);

/** Fotos del emprendimiento: la elegida grande y las miniaturas para cambiarla. */
function Gallery({ view }: { readonly view: DevelopmentQuickView }) {
  const [selected, setSelected] = useState(0);
  const owner = { kind: 'development', id: view.detail.id } as const;
  const photo = view.photos[selected] ?? view.photos[0];
  if (photo === undefined) {
    return (
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted text-sm text-muted-foreground">
        <ImageIcon className="h-6 w-6" aria-hidden />
        Todavía no hay fotos.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {/* Foto del storage privado, servida por el panel: no pasa por el optimizador de Next. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- la sirve una ruta autorizada del panel */}
      <img
        src={`${mediaFileHref(owner, photo.id)}?v=web`}
        alt={photo.description ?? `Foto de ${view.detail.name}`}
        className="aspect-[16/9] w-full rounded-lg bg-muted object-cover"
      />
      {view.photos.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Fotos">
          {view.photos.map((item, index) => (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Ver la foto ${(index + 1).toString()}`}
                aria-pressed={index === selected}
                className={cn(
                  'block overflow-hidden rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  index === selected ? 'ring-2 ring-primary-500' : 'opacity-70 hover:opacity-100',
                )}
                onClick={() => {
                  setSelected(index);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- la sirve una ruta autorizada del panel */}
                <img
                  src={`${mediaFileHref(owner, item.id)}?v=thumbnail`}
                  alt=""
                  className="h-14 w-20 object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Content({ view }: { readonly view: DevelopmentQuickView }) {
  const { detail } = view;
  // La vista rápida no se vuelve a pedir al marcarlo: la estrella guarda lo que quedó.
  const [favorite, setFavorite] = useState(view.favorite);
  const status = DEVELOPMENT_STATUS_DISPLAY[detail.status];
  const href = `/emprendimientos/${detail.id}`;
  const amenities = detail.features.map((feature) => feature.name);
  const facts = [
    detail.developmentType === undefined
      ? undefined
      : DEVELOPMENT_TYPE_LABELS[detail.developmentType],
    detail.deliveryDate === undefined
      ? undefined
      : `Entrega ${formatDateOnly(detail.deliveryDate)}`,
    detail.developerName,
  ].filter((fact) => fact !== undefined);

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader className="gap-1 pr-8 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground tabular-nums">
            {detail.code}
          </span>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          {detail.constructionStatus !== undefined && (
            <StatusPill tone="amber">
              {CONSTRUCTION_STATUS_LABELS[detail.constructionStatus]}
            </StatusPill>
          )}
        </div>
        <div className="flex items-start gap-1">
          <DialogTitle className="flex-1 text-lg">{detail.name}</DialogTitle>
          <DevelopmentFavoriteToggle
            developmentId={detail.id}
            favorite={favorite}
            onChange={setFavorite}
          />
        </div>
        <DialogDescription>{[detail.publishAddress, ...facts].join(' · ')}</DialogDescription>
      </DialogHeader>

      <Gallery view={view} />

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border p-3">
          <dt className="text-muted-foreground">Unidades</dt>
          <dd className="text-lg font-semibold tabular-nums">{detail.unitCount}</dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-muted-foreground">Disponibles</dt>
          <dd className="text-lg font-semibold tabular-nums">{detail.availableUnitCount}</dd>
        </div>
      </dl>

      <section aria-labelledby="quick-view-amenities" className="flex flex-col gap-1 text-sm">
        <h3 id="quick-view-amenities" className="font-medium">
          Servicios y amenities
        </h3>
        <p className="text-muted-foreground">
          {amenities.length === 0 ? 'Sin cargar.' : amenities.join(' · ')}
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={href as Route}>Abrir la ficha</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`${href}?tab=unidades` as Route}>
            <LayoutListIcon className="h-4 w-4" />
            Ver unidades
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`${href}?tab=archivos` as Route}>
            <FileTextIcon className="h-4 w-4" />
            {formatCount(view.attachmentCount, 'archivo', 'archivos')}
          </Link>
        </Button>
        {view.canExportUnits && detail.unitCount > 0 && (
          <ExportUnitsButton developmentId={detail.id} size="sm" label="Descargar unidades" />
        )}
        {detail.websiteUrl !== undefined && (
          <Button asChild size="sm" variant="outline">
            <a href={detail.websiteUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="h-4 w-4" />
              Página web
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Vista rápida de un emprendimiento desde el listado: fotos, estado, unidades disponibles,
 * amenities y accesos a la ficha, sin salir de la grilla.
 */
export function DevelopmentQuickViewDialog({
  developmentId,
  onClose,
}: {
  readonly developmentId: string | undefined;
  readonly onClose: () => void;
}) {
  const [result, setResult] = useState<Loaded | undefined>();
  // Al cerrar se sigue viendo lo último hasta que termina la animación de salida.
  const loaded =
    developmentId === undefined || result?.developmentId === developmentId ? result : undefined;

  useEffect(() => {
    if (developmentId === undefined) return;
    let active = true;
    loadDevelopmentQuickViewAction({ developmentId }).then(
      (response) => {
        if (!active) return;
        setResult(
          response.ok
            ? { developmentId, status: 'ready', view: response.value }
            : { developmentId, status: 'failed', message: response.message },
        );
      },
      () => {
        if (active) {
          setResult({ developmentId, status: 'failed', message: UNEXPECTED_ERROR_MESSAGE });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [developmentId]);

  return (
    <Dialog
      open={developmentId !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {loaded?.status === 'ready' ? (
          <Content view={loaded.view} />
        ) : loaded?.status === 'failed' ? (
          <>
            <DialogTitle>Vista rápida</DialogTitle>
            <FormAlert message={loaded.message} />
          </>
        ) : (
          <div className="flex flex-col gap-3" aria-busy="true">
            <DialogTitle className="sr-only">Cargando el emprendimiento</DialogTitle>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="aspect-[16/9] w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
