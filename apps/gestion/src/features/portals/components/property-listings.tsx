'use client';

import type {
  ListingOperationValue,
  ListingTypeValue,
  PortalValue,
  PropertyListingView,
  PropertyListingsView,
} from '@norde/core/portals/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { SectionCard } from '@norde/ui/components/section-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import {
  ExternalLinkIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { formatDateTime } from '../../../lib/format';
import { FormAlert } from '../../shared/components/form-alert';
import {
  changeListingTypeAction,
  pauseListingAction,
  requestPublicationAction,
  resumeListingAction,
  resyncListingAction,
  unpublishListingAction,
} from '../actions';
import { LISTING_OPERATION_LABELS, LISTING_STATUS_LABELS, LISTING_TYPE_LABELS } from '../labels';
import { PORTAL_LABELS } from '../messages';

/** Mientras haya avisos publicándose, la pestaña se refresca sola cada tanto. */
const REFRESH_MS = 5000;
const MAX_REFRESHES = 24;

/**
 * La pestaña Difusión de la ficha: una fila por operación de la propiedad en cada portal activo,
 * con publicar, pausar, reactivar, sincronizar, cambiar el tipo y dar de baja.
 */
export function PropertyListings({
  propertyId,
  operations,
  view,
  isUnit,
  isAvailable,
}: {
  readonly propertyId: string;
  readonly operations: readonly ListingOperationValue[];
  readonly view: PropertyListingsView;
  readonly isUnit: boolean;
  readonly isAvailable: boolean;
}) {
  const pending = view.listings.some((listing) => listing.status === 'pending');
  useAutoRefresh(pending);

  if (isUnit) {
    return (
      <SectionCard title="Difusión en portales">
        <p className="text-sm text-muted-foreground">
          Las unidades se publican dentro de su emprendimiento, desde la ficha del emprendimiento.
        </p>
      </SectionCard>
    );
  }
  const portals = [
    ...new Set<PortalValue>([...view.portals, ...view.listings.map((l) => l.portal)]),
  ];
  if (portals.length === 0) {
    return (
      <SectionCard title="Difusión en portales">
        <p className="text-sm text-muted-foreground">
          No hay cuentas de portales activas.{' '}
          <Link href="/mi-empresa/portales" className="font-medium text-primary hover:underline">
            Conectá MercadoLibre en Mi empresa → Portales
          </Link>
          .
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {portals.map((portal) => (
        <SectionCard key={portal} title={PORTAL_LABELS[portal]}>
          <ul className="flex flex-col divide-y divide-border">
            {operations.map((operation) => (
              <ListingRow
                key={operation}
                propertyId={propertyId}
                portal={portal}
                operation={operation}
                listing={view.listings.find(
                  (l) => l.portal === portal && l.operation === operation,
                )}
                canPublish={view.canPublish && view.portals.includes(portal)}
                isAvailable={isAvailable}
              />
            ))}
          </ul>
          {!isAvailable && (
            <p className="mt-3 text-xs text-muted-foreground">
              Solo se publica una propiedad disponible. Si está reservada o pausada, sus avisos
              quedan en pausa; vendida, alquilada o dada de baja, se cierran.
            </p>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

function ListingRow({
  propertyId,
  portal,
  operation,
  listing,
  canPublish,
  isAvailable,
}: {
  readonly propertyId: string;
  readonly portal: PortalValue;
  readonly operation: ListingOperationValue;
  readonly listing: PropertyListingView | undefined;
  readonly canPublish: boolean;
  readonly isAvailable: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [type, setType] = useState<ListingTypeValue>(listing?.listingType ?? 'simple');
  const [confirming, setConfirming] = useState(false);

  function run(action: () => Promise<ActionResult>, success: string) {
    setError(undefined);
    startTransition(async () => {
      const message = await runAction(action);
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(success);
    });
  }

  const closed = listing === undefined || listing.intent === 'closed';
  const status = listing ? LISTING_STATUS_LABELS[listing.status] : undefined;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{LISTING_OPERATION_LABELS[operation]}</span>
        {status ? (
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        ) : (
          <span className="text-sm text-muted-foreground">Sin publicar</span>
        )}
        {listing && !closed && (
          <span className="text-sm text-muted-foreground">
            {LISTING_TYPE_LABELS[listing.listingType]}
          </span>
        )}
        {listing?.intent === 'paused' && listing.status !== 'paused' && (
          <span className="text-sm text-muted-foreground">Pausándose…</span>
        )}
        {listing?.permalink && listing.status !== 'unpublished' && (
          <a
            href={listing.permalink}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver en MercadoLibre
            <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>

      {listing?.lastError && <FormAlert message={`Último error: ${listing.lastError}`} />}
      {listing?.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Última sincronización: {formatDateTime(listing.lastSyncedAt)}
        </p>
      )}
      <FormAlert message={error} />

      {canPublish && (
        <div className="flex flex-wrap items-center gap-2">
          {closed ? (
            <>
              <Select
                value={type}
                onValueChange={(next) => {
                  setType(next === 'featured' ? 'featured' : 'simple');
                }}
                disabled={busy}
              >
                <SelectTrigger className="w-[150px]" aria-label="Tipo de aviso">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">{LISTING_TYPE_LABELS.simple}</SelectItem>
                  <SelectItem value="featured">{LISTING_TYPE_LABELS.featured}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={busy || !isAvailable}
                onClick={() => {
                  run(
                    () =>
                      requestPublicationAction({
                        propertyId,
                        portal,
                        operation,
                        listingType: type,
                      }),
                    'Publicación pedida: el aviso se crea en unos segundos',
                  );
                }}
              >
                {busy ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <SendIcon className="h-4 w-4" aria-hidden />
                )}
                {listing ? 'Volver a publicar' : 'Publicar'}
              </Button>
            </>
          ) : (
            <>
              {listing.intent === 'paused' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    run(() => resumeListingAction({ listingId: listing.id }), 'Aviso reactivado');
                  }}
                >
                  <PlayIcon className="h-4 w-4" aria-hidden />
                  Reactivar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    run(() => pauseListingAction({ listingId: listing.id }), 'Aviso pausado');
                  }}
                >
                  <PauseIcon className="h-4 w-4" aria-hidden />
                  Pausar
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  run(
                    () =>
                      changeListingTypeAction({
                        listingId: listing.id,
                        listingType: listing.listingType === 'simple' ? 'featured' : 'simple',
                      }),
                    'Tipo de aviso cambiado',
                  );
                }}
              >
                {listing.listingType === 'simple' ? 'Pasar a destacado' : 'Pasar a simple'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  run(
                    () => resyncListingAction({ listingId: listing.id }),
                    'Sincronización pedida',
                  );
                }}
              >
                <RefreshCwIcon className="h-4 w-4" aria-hidden />
                Sincronizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={busy}
                onClick={() => {
                  setConfirming(true);
                }}
              >
                <Trash2Icon className="h-4 w-4" aria-hidden />
                Dar de baja
              </Button>
              <UnpublishDialog
                open={confirming}
                onOpenChange={setConfirming}
                onConfirm={() => {
                  setConfirming(false);
                  run(() => unpublishListingAction({ listingId: listing.id }), 'Baja pedida');
                }}
              />
            </>
          )}
        </div>
      )}
    </li>
  );
}

function UnpublishDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar de baja el aviso</DialogTitle>
          <DialogDescription>
            El aviso se cierra en MercadoLibre y no se puede reactivar: para volver a mostrarlo hay
            que publicarlo de nuevo, como un aviso nuevo (con otra antigüedad y sin sus visitas). Si
            solo querés sacarlo un tiempo, pausalo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Dar de baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Refresca la ficha mientras hay avisos publicándose (los crea un job), con un tope. */
function useAutoRefresh(active: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      if (count > MAX_REFRESHES) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [active, router]);
}
