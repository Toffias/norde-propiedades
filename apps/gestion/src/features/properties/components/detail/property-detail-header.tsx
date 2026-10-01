'use client';

import {
  MANUAL_STATUS_VALUES,
  type PanelPropertyDetail,
  type PropertyStatusValue,
  type PropertyType,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { Skeleton } from '@norde/ui/components/skeleton';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import {
  BarChart3Icon,
  BuildingIcon,
  ChevronDownIcon,
  EyeIcon,
  FileDownIcon,
  FileTextIcon,
  GlobeIcon,
  MapPinIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import type { Route } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { runAction } from '../../../../lib/action-result';
import { changePropertyStatusAction, updatePropertyPublicationAction } from '../../detail-actions';
import { PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../../labels';
import { FavoriteToggle } from '../favorite-toggle';
import { DocumentsDialog, OwnerReportDialog, useRequestDocument } from './documents-dialogs';
import type { DetailPermissions } from './permissions';

const LocationMapCanvas = dynamic(
  () => import('./location-map-canvas').then((module) => module.LocationMapCanvas),
  { ssr: false, loading: () => <Skeleton className="h-[50vh] min-h-[300px] w-full" /> },
);

function isPropertyType(value: string): value is PropertyType {
  return value in PROPERTY_TYPE_LABELS;
}

function isStatus(value: string): value is PropertyStatusValue {
  return value in PROPERTY_STATUS_DISPLAY;
}

/**
 * Cabecera de la ficha: portada, estado (con su cambio), tipo, código y ubicación, favorito,
 * publicación en la web y las acciones (mapa, PDF, reporte al propietario, vista previa).
 */
export function PropertyDetailHeader({
  detail,
  permissions,
  favorite,
}: {
  readonly detail: PanelPropertyDetail;
  readonly permissions: DetailPermissions;
  readonly favorite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mapOpen, setMapOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const documents = useRequestDocument(detail.id, () => {
    setDocumentsOpen(true);
  });

  const status = isStatus(detail.status) ? PROPERTY_STATUS_DISPLAY[detail.status] : undefined;
  const type = isPropertyType(detail.propertyType)
    ? PROPERTY_TYPE_LABELS[detail.propertyType]
    : detail.propertyType;
  const place =
    detail.locationPath.length > 0
      ? detail.locationPath
          .map((level) => level.name)
          .slice(1)
          .join(' › ')
      : [detail.address.neighborhood, detail.address.city].filter(Boolean).join(', ');
  const statuses = MANUAL_STATUS_VALUES.filter(
    (value) => value !== detail.status && (permissions.markAvailable || value !== 'available'),
  );

  function run(
    action: () => Promise<
      { readonly ok: boolean } & ({ ok: true } | { ok: false; message: string })
    >,
    success: string,
  ) {
    startTransition(async () => {
      const error = await runAction(action);
      if (error === undefined) toast.success(success);
      else toast.error(error);
    });
  }

  const publication = detail.publication;
  const togglePublication = (field: keyof typeof publication, value: boolean) => {
    run(
      () => updatePropertyPublicationAction({ propertyId: detail.id, [field]: value }),
      'Publicación actualizada.',
    );
  };

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-linear-to-br from-entity-header-from to-entity-header-to p-4 text-white sm:flex-row sm:items-center sm:p-5">
        <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-primary-500 sm:h-20 sm:w-28">
          {detail.cover === undefined ? (
            <div className="flex h-full items-center justify-center">
              <BuildingIcon className="h-8 w-8" aria-hidden />
            </div>
          ) : (
            // Foto del storage privado, servida por el panel: no pasa por el optimizador de Next.
            // eslint-disable-next-line @next/next/no-img-element -- la sirve una ruta autorizada del panel
            <img
              src={`/propiedades/${detail.id}/fotos/${detail.cover.mediaId}?v=thumbnail`}
              alt="Portada"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {status !== undefined && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
            {detail.deletedAt !== undefined && <StatusPill tone="red">En la papelera</StatusPill>}
            {publication.featured && <StatusPill tone="amber">Destacada</StatusPill>}
            {detail.isPubliclyListed && <StatusPill tone="green">En la web</StatusPill>}
          </div>
          <h1
            className="mt-1 text-lg font-extrabold break-words !text-white"
            title={detail.portalTitle}
          >
            {detail.portalTitle}
          </h1>
          <p className="mt-0.5 text-sm leading-normal text-entity-header-muted">
            {type} · {detail.code} · {place}
          </p>
          <p className="text-sm leading-normal text-entity-header-muted">
            {detail.publishAddress}
            {detail.address.street !== '' &&
              ` (${[detail.address.street, detail.address.streetNumber].filter(Boolean).join(' ')})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-white/10 p-1">
            <FavoriteToggle propertyId={detail.id} code={detail.code} favorite={favorite} />
          </div>

          {permissions.edit && statuses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="dark:bg-card" disabled={pending}>
                  Cambiar estado
                  <ChevronDownIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {statuses.map((value) => (
                  <DropdownMenuItem
                    key={value}
                    onSelect={() => {
                      run(
                        () => changePropertyStatusAction({ propertyId: detail.id, status: value }),
                        `Ahora está ${PROPERTY_STATUS_DISPLAY[value].label.toLowerCase()}.`,
                      );
                    }}
                  >
                    {PROPERTY_STATUS_DISPLAY[value].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {permissions.publish && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="dark:bg-card" disabled={pending}>
                  <GlobeIcon className="h-4 w-4" />
                  Publicación
                  <ChevronDownIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Sitio web de Norde</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={publication.publishedOnWeb}
                  onCheckedChange={(checked) => {
                    togglePublication('publishedOnWeb', checked);
                  }}
                >
                  Publicar en web
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={publication.showPriceOnWeb}
                  onCheckedChange={(checked) => {
                    togglePublication('showPriceOnWeb', checked);
                  }}
                >
                  Mostrar el precio
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={publication.showExactAddress}
                  onCheckedChange={(checked) => {
                    togglePublication('showExactAddress', checked);
                  }}
                >
                  Mostrar la dirección exacta
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={publication.featured}
                  onCheckedChange={(checked) => {
                    togglePublication('featured', checked);
                  }}
                >
                  Destacada
                </DropdownMenuCheckboxItem>
                {!detail.isPubliclyListed && publication.publishedOnWeb && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    La web la muestra solo mientras esté disponible.
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="dark:bg-card"
                aria-label="Más acciones"
              >
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem
                disabled={detail.coordinates === undefined}
                onSelect={() => {
                  setMapOpen(true);
                }}
              >
                <MapPinIcon className="h-4 w-4" />
                {detail.coordinates === undefined ? 'Sin ubicación en el mapa' : 'Ver en el mapa'}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/propiedades/${detail.id}/vista-previa` as Route} target="_blank">
                  <EyeIcon className="h-4 w-4" />
                  Vista previa en la web
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/propiedades/${detail.id}?tab=estadisticas` as Route}>
                  <BarChart3Icon className="h-4 w-4" />
                  Estadísticas
                </Link>
              </DropdownMenuItem>
              {permissions.export && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Exportar</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={documents.pending}
                    onSelect={() => {
                      documents.request('sheet');
                    }}
                  >
                    <FileDownIcon className="h-4 w-4" />
                    Ficha en PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={documents.pending}
                    onSelect={() => {
                      documents.request('showcase');
                    }}
                  >
                    <FileDownIcon className="h-4 w-4" />
                    PDF de vidriera
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setReportOpen(true);
                    }}
                  >
                    <FileTextIcon className="h-4 w-4" />
                    Reporte al propietario
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setDocumentsOpen(true);
                    }}
                  >
                    PDF pedidos
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ubicación</DialogTitle>
            <DialogDescription>{detail.publishAddress}</DialogDescription>
          </DialogHeader>
          {detail.coordinates !== undefined && (
            <LocationMapCanvas
              latitude={detail.coordinates.latitude}
              longitude={detail.coordinates.longitude}
            />
          )}
        </DialogContent>
      </Dialog>
      <DocumentsDialog
        propertyId={detail.id}
        open={documentsOpen}
        onOpenChange={setDocumentsOpen}
      />
      <OwnerReportDialog
        propertyId={detail.id}
        open={reportOpen}
        onOpenChange={setReportOpen}
        onRequested={() => {
          setDocumentsOpen(true);
        }}
      />
    </>
  );
}
