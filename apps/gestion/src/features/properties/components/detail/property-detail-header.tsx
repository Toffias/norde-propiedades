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
  BookmarkCheckIcon,
  BuildingIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  FileDownIcon,
  FileTextIcon,
  FilesIcon,
  GlobeIcon,
  Loader2Icon,
  MapPinIcon,
  MoreHorizontalIcon,
  TagsIcon,
  UserPlusIcon,
} from 'lucide-react';
import type { Route } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { runAction } from '../../../../lib/action-result';
import { FeatureToClientDialog } from '../../../clients/components/feature-to-client-dialog';
import { TagList, TagsDialog } from '../../../shared/components/tags-dialog';
import { loadTagOptions } from '../../actions';
import {
  changePropertyStatusAction,
  changePropertyTagsAction,
  updatePropertyPublicationAction,
} from '../../detail-actions';
import { PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../../labels';
import { FavoriteToggle } from '../favorite-toggle';
import { PropertyPhoto } from '../property-photo';
import { ReservationDialog, type ReservationSubject } from '../reservations/reservation-dialog';
import { DocumentsDialog, SheetDocumentDialog } from './documents-dialogs';
import { OwnerReportDialog } from './owner-report-dialog';
import type { DetailPermissions } from './permissions';
import { ShowcaseDocumentDialog } from './showcase-dialog';

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
 * publicación en la web y las acciones (mapa, PDF, reporte al propietario).
 */
export function PropertyDetailHeader({
  detail,
  permissions,
  favorite,
  reservationSubject,
}: {
  readonly detail: PanelPropertyDetail;
  readonly permissions: DetailPermissions;
  readonly favorite: boolean;
  readonly reservationSubject: ReservationSubject;
}) {
  const [pending, startTransition] = useTransition();
  // Qué menú disparó la acción en curso, para mostrar el spinner en su botón.
  const [running, setRunning] = useState<'status' | 'publication' | undefined>();
  const [mapOpen, setMapOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [featuring, setFeaturing] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [tagging, setTagging] = useState(false);

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
  // Una reservada cambia de estado con su reserva (se cae o se firma), no a mano.
  const reserved = detail.status === 'reserved';
  const statuses = reserved
    ? []
    : MANUAL_STATUS_VALUES.filter(
        (value) => value !== detail.status && (permissions.markAvailable || value !== 'available'),
      );
  const canReserve = permissions.reserve && detail.status === 'available';

  function run(
    menu: 'status' | 'publication',
    action: () => Promise<
      { readonly ok: boolean } & ({ ok: true } | { ok: false; message: string })
    >,
    success: string,
  ) {
    setRunning(menu);
    startTransition(async () => {
      const error = await runAction(action);
      if (error === undefined) toast.success(success);
      else toast.error(error);
    });
  }

  const publication = detail.publication;
  const togglePublication = (field: keyof typeof publication, value: boolean) => {
    run(
      'publication',
      () => updatePropertyPublicationAction({ propertyId: detail.id, [field]: value }),
      'Publicación actualizada.',
    );
  };

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-linear-to-br from-entity-header-from to-entity-header-to p-4 text-white sm:flex-row sm:items-center sm:p-5">
        <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-primary-500 sm:h-20 sm:w-28">
          <PropertyPhoto
            propertyId={detail.id}
            cover={detail.cover}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full items-center justify-center">
                <BuildingIcon className="h-8 w-8" aria-hidden />
              </div>
            }
          />
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
            {[type, detail.code, place].filter((part) => part !== '').join(' · ')}
          </p>
          <p className="text-sm leading-normal text-entity-header-muted">
            {detail.publishAddress}
            {detail.address.street !== '' &&
              ` (${[detail.address.street, detail.address.streetNumber].filter(Boolean).join(' ')})`}
          </p>
          {detail.development !== undefined && (
            <p className="text-sm leading-normal text-entity-header-muted">
              Unidad de{' '}
              <Link
                // La ficha del emprendimiento: typedRoutes no verifica un segmento armado.
                href={`/emprendimientos/${detail.development.id}` as Route}
                className="font-medium text-white underline-offset-2 hover:underline"
              >
                {detail.development.name}
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:items-end sm:self-start">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="rounded-lg bg-white/10 p-1">
              <FavoriteToggle propertyId={detail.id} code={detail.code} favorite={favorite} />
            </div>

            {canReserve && (
              <Button
                size="sm"
                variant="outline"
                className="text-foreground dark:bg-card"
                onClick={() => {
                  setReserving(true);
                }}
              >
                <BookmarkCheckIcon className="h-4 w-4" />
                Reservar
              </Button>
            )}

            {permissions.edit && reserved && (
              // Un botón deshabilitado no muestra su `title`: lo muestra el contenedor.
              <span title="Primero se cae o se firma la reserva.">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-foreground dark:bg-card"
                  disabled
                >
                  Cambiar estado
                  <ChevronDownIcon className="h-4 w-4" />
                </Button>
              </span>
            )}

            {permissions.edit && statuses.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-foreground dark:bg-card"
                    disabled={pending}
                  >
                    {pending && running === 'status' && (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    )}
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
                          'status',
                          () =>
                            changePropertyStatusAction({ propertyId: detail.id, status: value }),
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-foreground dark:bg-card"
                    disabled={pending}
                  >
                    {pending && running === 'publication' ? (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                      <GlobeIcon className="h-4 w-4" />
                    )}
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
                  className="text-foreground dark:bg-card"
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
                  <Link href={`/propiedades/${detail.id}?tab=estadisticas` as Route}>
                    <BarChart3Icon className="h-4 w-4" />
                    Estadísticas
                  </Link>
                </DropdownMenuItem>
                {permissions.edit && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setTagging(true);
                    }}
                  >
                    <TagsIcon className="h-4 w-4" />
                    Gestionar etiquetas
                  </DropdownMenuItem>
                )}
                {permissions.featureToClient && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setFeaturing(true);
                    }}
                  >
                    <UserPlusIcon className="h-4 w-4" />
                    Destacar a un contacto
                  </DropdownMenuItem>
                )}
                {permissions.export && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Exportar</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => {
                        setSheetOpen(true);
                      }}
                    >
                      <FileDownIcon className="h-4 w-4" />
                      Ficha en PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setShowcaseOpen(true);
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
                    <DropdownMenuItem asChild>
                      {/* Un archivo para descargar, no una página: un link común, no `Link`. */}
                      <a href={`/propiedades/${detail.id}/planilla-tasacion`} download>
                        <ClipboardListIcon className="h-4 w-4" />
                        Planilla de tasación
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDocumentsOpen(true);
                      }}
                    >
                      <FilesIcon className="h-4 w-4" />
                      PDF pedidos
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <TagList tags={detail.tags} onDark className="sm:justify-end" />
        </div>
      </div>

      {tagging && (
        <TagsDialog
          subject={detail.code}
          tags={detail.tags}
          loadPage={loadTagOptions}
          save={(tagIds) => changePropertyTagsAction({ propertyId: detail.id, tagIds })}
          open={tagging}
          onOpenChange={setTagging}
        />
      )}

      {reserving && (
        <ReservationDialog
          subject={reservationSubject}
          open={reserving}
          onOpenChange={setReserving}
        />
      )}

      {featuring && (
        <FeatureToClientDialog
          propertyIds={[detail.id]}
          subject={detail.code}
          open={featuring}
          onOpenChange={setFeaturing}
        />
      )}

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle icon={MapPinIcon}>Ubicación</DialogTitle>
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
        onSheet={() => {
          setSheetOpen(true);
        }}
        onShowcase={() => {
          setShowcaseOpen(true);
        }}
        onOwnerReport={() => {
          setReportOpen(true);
        }}
      />
      <SheetDocumentDialog
        propertyId={detail.id}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRequested={() => {
          setDocumentsOpen(true);
        }}
      />
      <ShowcaseDocumentDialog
        propertyId={detail.id}
        open={showcaseOpen}
        onOpenChange={setShowcaseOpen}
        onRequested={() => {
          setDocumentsOpen(true);
        }}
      />
      <OwnerReportDialog
        propertyId={detail.id}
        listedAt={detail.createdAt}
        open={reportOpen}
        onOpenChange={setReportOpen}
        onRequested={() => {
          setDocumentsOpen(true);
        }}
      />
    </>
  );
}
