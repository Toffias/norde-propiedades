'use client';

import type {
  ListingOperationValue,
  ListingOwnerKindValue,
  ListingTypeValue,
  PortalCreditView,
  PortalPublishingView,
  PortalValue,
  PropertyListingView,
  PropertyListingsView,
} from '@norde/core/portals/contracts';
import { Button } from '@norde/ui/components/button';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
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
  ArchiveXIcon,
  ExternalLinkIcon,
  GlobeIcon,
  Link2Icon,
  LinkIcon,
  Loader2Icon,
  MegaphoneIcon,
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
  changeListingPlanAction,
  linkDevelopmentListingAction,
  linkPortalListingAction,
  changeListingTypeAction,
  pauseListingAction,
  requestDevelopmentPublicationAction,
  requestPublicationAction,
  resumeListingAction,
  resyncListingAction,
  unpublishListingAction,
} from '../actions';
import { LISTING_OPERATION_LABELS, LISTING_STATUS_LABELS, LISTING_TYPE_LABELS } from '../labels';
import { PORTAL_LABELS, PORTAL_SITE_NAMES, planLabel } from '../messages';
import type { ListingStatsResult, PortalCreditsResult } from '../queries';

/** Mientras haya avisos publicándose, la pestaña se refresca sola cada tanto. */
const REFRESH_MS = 5000;
const MAX_REFRESHES = 24;

/** De qué es la pestaña: una propiedad o un emprendimiento. */
interface ListingOwner {
  readonly kind: ListingOwnerKindValue;
  readonly id: string;
}

/**
 * La pestaña Difusión de la ficha. En los portales con un aviso por operación (MercadoLibre), una
 * fila por operación; en los de un aviso por propiedad (Zonaprop), una sola fila con todas las
 * operaciones con precio y el plan elegido. Publicar, pausar, reactivar, sincronizar, cambiar el
 * tipo o el plan y dar de baja.
 */
export function PropertyListings({
  propertyId,
  operations,
  view,
  isUnit,
  isAvailable,
  plans,
  stats = NO_STATS,
}: {
  readonly propertyId: string;
  readonly operations: readonly ListingOperationValue[];
  readonly view: PropertyListingsView;
  readonly isUnit: boolean;
  readonly isAvailable: boolean;
  /** Los planes y créditos de los portales con plan, leídos del portal. */
  readonly plans: Readonly<Partial<Record<PortalValue, PortalCreditsResult>>>;
  /** Visitas y contactos de cada aviso, por ID de publicación (los portales que los informan). */
  readonly stats?: Readonly<Record<string, ListingStatsResult>>;
}) {
  const pending = view.listings.some((listing) => listing.status === 'pending');
  useAutoRefresh(pending);

  if (isUnit) {
    // Una unidad va dentro del aviso de su emprendimiento. En MercadoLibre, Tokko publicó cada
    // unidad suelta: esos avisos se vinculan a la unidad y se sincronizan como una propiedad.
    const unitPortals = view.portals.filter((p) => p.unitsAsListings);
    const unitView: PropertyListingsView = {
      ...view,
      portals: unitPortals,
      listings: view.listings.filter((l) => l.operation !== undefined),
    };
    if (unitView.portals.length === 0 && unitView.listings.length === 0) {
      return (
        <SectionCard title="Difusión en portales" icon={MegaphoneIcon}>
          <p className="text-sm text-muted-foreground">
            Las unidades se publican dentro de su emprendimiento, desde la ficha del emprendimiento.
          </p>
        </SectionCard>
      );
    }
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Las unidades se publican dentro de su emprendimiento, desde la ficha del emprendimiento.
          En MercadoLibre, el aviso suelto que publicó Tokko se puede vincular a la unidad: se
          sincroniza como el de cualquier propiedad.
        </p>
        <ListingsPanel
          owner={{ kind: 'property', id: propertyId }}
          label={operations.map((o) => LISTING_OPERATION_LABELS[o]).join(' · ')}
          operations={operations}
          view={unitView}
          isAvailable={isAvailable}
          plans={plans}
          stats={stats}
          publishes={false}
          wholeNote=""
          unavailableNote="Si la unidad está reservada o pausada, su aviso queda en pausa; vendida, alquilada o dada de baja, se cierra."
        />
      </div>
    );
  }
  return (
    <ListingsPanel
      owner={{ kind: 'property', id: propertyId }}
      label={
        operations.map((o) => LISTING_OPERATION_LABELS[o]).join(' · ') || 'Todas las operaciones'
      }
      operations={operations}
      view={view}
      isAvailable={isAvailable}
      plans={plans}
      stats={stats}
      publishes
      wholeNote="Un solo aviso con todas las operaciones con precio: usa un crédito mientras está online. Pausar lo saca del portal y libera el crédito; reactivarlo vuelve a usar uno."
      unavailableNote="Solo se publica una propiedad disponible. Si está reservada o pausada, sus avisos quedan en pausa; vendida, alquilada o dada de baja, se cierran."
    />
  );
}

/**
 * La pestaña Difusión del emprendimiento: un aviso por portal con todas sus unidades disponibles
 * con precio, y el plan elegido entre los de emprendimientos.
 */
export function DevelopmentListings({
  developmentId,
  publishableUnits,
  isMarketing,
  view,
  plans,
  stats = NO_STATS,
}: {
  readonly developmentId: string;
  /** Unidades disponibles: las que van en el aviso (si tienen precio). */
  readonly publishableUnits: number;
  readonly isMarketing: boolean;
  readonly view: PropertyListingsView;
  readonly plans: Readonly<Partial<Record<PortalValue, PortalCreditsResult>>>;
  readonly stats?: Readonly<Record<string, ListingStatsResult>>;
}) {
  const pending = view.listings.some((listing) => listing.status === 'pending');
  useAutoRefresh(pending);
  const units =
    publishableUnits === 1
      ? '1 unidad disponible'
      : `${String(publishableUnits)} unidades disponibles`;

  return (
    <ListingsPanel
      owner={{ kind: 'development', id: developmentId }}
      label={`Emprendimiento · ${units}`}
      operations={[]}
      view={view}
      isAvailable={isMarketing && publishableUnits > 0}
      plans={plans}
      stats={stats}
      publishes
      wholeNote="Un solo aviso con todas las unidades disponibles con precio: las reservadas, vendidas o pausadas no van, y si no queda ninguna el aviso sale del portal hasta que haya una. Cada cambio del emprendimiento o de sus unidades actualiza el aviso."
      unavailableNote={
        isMarketing
          ? 'Para publicar hace falta al menos una unidad disponible con precio.'
          : 'Solo se publica un emprendimiento "Comercializando": mientras está cargando información, su aviso queda en pausa.'
      }
    />
  );
}

function ListingsPanel({
  owner,
  label,
  operations,
  view,
  isAvailable,
  plans,
  stats,
  publishes,
  wholeNote,
  unavailableNote,
}: {
  readonly owner: ListingOwner;
  /** Qué lleva el aviso de todo el dueño (las operaciones, o las unidades). */
  readonly label: string;
  readonly operations: readonly ListingOperationValue[];
  readonly view: PropertyListingsView;
  readonly isAvailable: boolean;
  readonly plans: Readonly<Partial<Record<PortalValue, PortalCreditsResult>>>;
  readonly stats: Readonly<Record<string, ListingStatsResult>>;
  /** Si se puede publicar un aviso nuevo; si no (una unidad), solo vincular uno existente. */
  readonly publishes: boolean;
  readonly wholeNote: string;
  readonly unavailableNote: string;
}) {
  const portals = [
    ...new Set<PortalValue>([
      ...view.portals.map((p) => p.portal),
      ...view.listings.map((l) => l.portal),
    ]),
  ];
  if (portals.length === 0) {
    return (
      <SectionCard title="Difusión en portales" icon={MegaphoneIcon}>
        <p className="text-sm text-muted-foreground">
          {owner.kind === 'development'
            ? 'No hay cuentas activas que publiquen emprendimientos. '
            : 'No hay cuentas de portales activas. '}
          <Link href="/mi-empresa/portales" className="font-medium text-primary hover:underline">
            Conectá un portal en Mi empresa → Portales
          </Link>
          .
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {portals.map((portal) => {
        const option = publishingOf(portal, view);
        const canPublish = view.canPublish && view.portals.some((p) => p.portal === portal);
        // Un emprendimiento es siempre un solo aviso, aunque el portal publique por operación.
        const whole = owner.kind === 'development' || option.listingScope === 'property';
        const rows = whole ? [undefined] : operations;
        return (
          <SectionCard key={portal} title={PORTAL_LABELS[portal]} icon={GlobeIcon}>
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((operation) => {
                const listing = view.listings.find(
                  (l) => l.portal === portal && l.operation === operation,
                );
                return (
                  <ListingRow
                    key={operation ?? 'all'}
                    owner={owner}
                    label={operation === undefined ? label : LISTING_OPERATION_LABELS[operation]}
                    portal={portal}
                    operation={operation}
                    listing={listing}
                    stats={listing === undefined ? undefined : stats[listing.id]}
                    canPublish={canPublish}
                    publishes={publishes}
                    linksExisting={option.linksExisting}
                    isAvailable={isAvailable}
                    plans={option.choosesPlan ? (plans[portal] ?? NO_PLANS) : undefined}
                  />
                );
              })}
            </ul>
            {whole && (
              <p className="mt-3 text-xs text-muted-foreground">
                {owner.kind === 'development' && portal === 'mercadolibre_developments'
                  ? ML_DEVELOPMENT_NOTE
                  : wholeNote}
              </p>
            )}
            {!isAvailable && (
              <p className="mt-3 text-xs text-muted-foreground">{unavailableNote}</p>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

/** En MercadoLibre, el emprendimiento va con las unidades en venta de un solo tipo. */
const ML_DEVELOPMENT_NOTE =
  'Un solo aviso con las unidades disponibles en venta, cada una como una variante con su precio. MercadoLibre publica emprendimientos de departamentos, casas, oficinas o lotes: van las del tipo más común, y las demás (cocheras, locales, alquileres) no entran. Todas tienen que tener el precio en la misma moneda. El tipo de aviso lo da el paquete de emprendimientos de la cuenta, que alcanza para un solo emprendimiento. Cada cambio del emprendimiento o de sus unidades actualiza el aviso; si no queda ninguna, se pausa.';

const NO_STATS: Readonly<Record<string, ListingStatsResult>> = {};

const NO_PLANS: PortalCreditsResult = {
  ok: false,
  message: 'No pudimos leer los planes del portal. Recargá la página.',
};

/**
 * Cómo se arma el aviso en el portal. Una cuenta desactivada ya no viene en la vista: se deduce
 * de sus publicaciones (sin operación, el aviso es de la propiedad).
 */
function publishingOf(portal: PortalValue, view: PropertyListingsView): PortalPublishingView {
  const option = view.portals.find((p) => p.portal === portal);
  if (option) return option;
  const whole = view.listings.some((l) => l.portal === portal && l.operation === undefined);
  return {
    portal,
    listingScope: whole ? 'property' : 'operation',
    choosesPlan: whole,
    linksExisting: false,
    unitsAsListings: false,
  };
}

/**
 * Los planes para ese tipo de aviso (los de propiedades o los de emprendimientos), con lo que
 * queda de cada uno.
 */
function plansFor(
  plans: PortalCreditsResult | undefined,
  kind: ListingOwnerKindValue,
): readonly PortalCreditView[] {
  return plans?.ok ? plans.credits.filter((c) => c.publishes === kind) : [];
}

function PlanSelect({
  plans,
  value,
  onChange,
  disabled,
}: {
  readonly plans: readonly PortalCreditView[];
  readonly value: string | undefined;
  readonly onChange: (plan: string) => void;
  readonly disabled: boolean;
}) {
  return (
    <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[220px]" aria-label="Plan del aviso">
        <SelectValue placeholder="Elegí el plan" />
      </SelectTrigger>
      <SelectContent>
        {plans.map((credit) => (
          <SelectItem key={credit.plan} value={credit.plan} disabled={credit.available <= 0}>
            {planLabel(credit.plan)} · {creditsLabel(credit.available)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function creditsLabel(available: number): string {
  if (available <= 0) return 'sin créditos';
  return available === 1 ? '1 crédito' : `${String(available)} créditos`;
}

function ListingRow({
  owner,
  label,
  portal,
  operation,
  listing,
  stats,
  canPublish,
  publishes,
  linksExisting,
  isAvailable,
  plans,
}: {
  readonly owner: ListingOwner;
  readonly label: string;
  readonly portal: PortalValue;
  /** Sin operación: el aviso lleva todas las de la propiedad (o es el del emprendimiento). */
  readonly operation: ListingOperationValue | undefined;
  readonly listing: PropertyListingView | undefined;
  /** Visitas y contactos del aviso, si el portal los informa. */
  readonly stats: ListingStatsResult | undefined;
  readonly canPublish: boolean;
  /** Si se puede publicar un aviso nuevo (una unidad solo vincula). */
  readonly publishes: boolean;
  /** Si se puede vincular un aviso que ya está online (lo publicó Tokko). */
  readonly linksExisting: boolean;
  readonly isAvailable: boolean;
  /** Solo en los portales con plan. */
  readonly plans: PortalCreditsResult | undefined;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [type, setType] = useState<ListingTypeValue>(listing?.listingType ?? 'simple');
  const choosesPlan = plans !== undefined;
  // El aviso de un emprendimiento no elige simple o destacado: lo da el paquete o el plan.
  const choosesType = !choosesPlan && owner.kind === 'property';
  const offeredPlans = plansFor(plans, owner.kind);
  // Sin plan elegido de antemano: cada plan consume créditos distintos, lo decide quien publica.
  const [plan, setPlan] = useState<string | undefined>(listing?.plan);
  const [confirming, setConfirming] = useState(false);
  const [linking, setLinking] = useState(false);

  // Qué botón disparó la acción en curso, para mostrar su spinner.
  const [running, setRunning] = useState<ListingRowAction | undefined>();
  const spinning = (action: ListingRowAction) => busy && running === action;

  function run(key: ListingRowAction, action: () => Promise<ActionResult>, success: string) {
    setError(undefined);
    setRunning(key);
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
        <span className="font-semibold">{label}</span>
        {status ? (
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        ) : (
          <span className="text-sm text-muted-foreground">Sin publicar</span>
        )}
        {listing && !closed && (
          <span className="text-sm text-muted-foreground">
            {listing.plan !== undefined
              ? `Plan ${planLabel(listing.plan)}`
              : choosesType
                ? LISTING_TYPE_LABELS[listing.listingType]
                : undefined}
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
            Ver en {PORTAL_SITE_NAMES[portal]}
            <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>

      {listing?.lastError && (
        <FormAlert
          message={
            listing.status === 'error' ? `Último error: ${listing.lastError}` : listing.lastError
          }
        />
      )}
      {listing?.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Última sincronización: {formatDateTime(listing.lastSyncedAt)}
        </p>
      )}
      {stats && <ListingStatsLine stats={stats} />}
      <FormAlert message={error} />
      {canPublish && plans !== undefined && !plans.ok && <FormAlert message={plans.message} />}

      {canPublish && (
        <div className="flex flex-wrap items-center gap-2">
          {closed ? (
            <>
              {publishes && (
                <>
                  {choosesPlan ? (
                    <PlanSelect
                      plans={offeredPlans}
                      value={plan}
                      onChange={setPlan}
                      disabled={busy}
                    />
                  ) : (
                    choosesType && (
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
                    )
                  )}
                  <Button
                    size="sm"
                    disabled={busy || !isAvailable || (choosesPlan && plan === undefined)}
                    onClick={() => {
                      const chosen = choosesPlan && plan !== undefined ? { plan } : {};
                      run(
                        'publish',
                        () =>
                          owner.kind === 'development'
                            ? requestDevelopmentPublicationAction({
                                developmentId: owner.id,
                                portal,
                                ...chosen,
                              })
                            : requestPublicationAction({
                                propertyId: owner.id,
                                portal,
                                ...(operation === undefined ? {} : { operation }),
                                listingType: type,
                                ...chosen,
                              }),
                        'Publicación pedida: el aviso se crea en unos segundos',
                      );
                    }}
                  >
                    {spinning('publish') ? (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                      <SendIcon className="h-4 w-4" aria-hidden />
                    )}
                    {listing ? 'Volver a publicar' : 'Publicar'}
                  </Button>
                </>
              )}
              {linksExisting && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setLinking(true);
                  }}
                >
                  <Link2Icon className="h-4 w-4" aria-hidden />
                  Vincular un aviso existente
                </Button>
              )}
              {linking && (
                <LinkListingDialog
                  owner={owner}
                  portal={portal}
                  plans={choosesPlan ? offeredPlans : undefined}
                  onClose={() => {
                    setLinking(false);
                  }}
                />
              )}
            </>
          ) : (
            <>
              {listing.intent === 'paused' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    run(
                      'resume',
                      () => resumeListingAction({ listingId: listing.id }),
                      'Aviso reactivado',
                    );
                  }}
                >
                  {spinning('resume') ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayIcon className="h-4 w-4" aria-hidden />
                  )}
                  Reactivar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    run(
                      'pause',
                      () => pauseListingAction({ listingId: listing.id }),
                      'Aviso pausado',
                    );
                  }}
                >
                  {spinning('pause') ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <PauseIcon className="h-4 w-4" aria-hidden />
                  )}
                  Pausar
                </Button>
              )}
              {choosesPlan ? (
                <>
                  <PlanSelect
                    plans={offeredPlans}
                    value={plan}
                    onChange={setPlan}
                    disabled={busy}
                  />
                  {plan !== undefined && plan !== listing.plan && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        run(
                          'plan',
                          () => changeListingPlanAction({ listingId: listing.id, plan }),
                          'Plan cambiado',
                        );
                      }}
                    >
                      {spinning('plan') && <Loader2Icon className="h-4 w-4 animate-spin" />}
                      Cambiar plan
                    </Button>
                  )}
                </>
              ) : (
                choosesType && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      run(
                        'type',
                        () =>
                          changeListingTypeAction({
                            listingId: listing.id,
                            listingType: listing.listingType === 'simple' ? 'featured' : 'simple',
                          }),
                        'Tipo de aviso cambiado',
                      );
                    }}
                  >
                    {spinning('type') && <Loader2Icon className="h-4 w-4 animate-spin" />}
                    {listing.listingType === 'simple' ? 'Pasar a destacado' : 'Pasar a simple'}
                  </Button>
                )
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  run(
                    'resync',
                    () => resyncListingAction({ listingId: listing.id }),
                    'Sincronización pedida',
                  );
                }}
              >
                {spinning('resync') ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCwIcon className="h-4 w-4" aria-hidden />
                )}
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
                {spinning('unpublish') ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2Icon className="h-4 w-4" aria-hidden />
                )}
                Dar de baja
              </Button>
              <UnpublishDialog
                portal={portal}
                open={confirming}
                onOpenChange={setConfirming}
                onConfirm={() => {
                  setConfirming(false);
                  run(
                    'unpublish',
                    () => unpublishListingAction({ listingId: listing.id }),
                    'Baja pedida',
                  );
                }}
              />
            </>
          )}
        </div>
      )}
    </li>
  );
}

type ListingRowAction = 'publish' | 'resume' | 'pause' | 'plan' | 'type' | 'resync' | 'unpublish';

function UnpublishDialog({
  portal,
  open,
  onOpenChange,
  onConfirm,
}: {
  readonly portal: PortalValue;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle icon={ArchiveXIcon}>Dar de baja el aviso</DialogTitle>
          <DialogDescription>
            {portal === 'zonaprop'
              ? 'El aviso sale de Zonaprop y libera su crédito. Para volver a mostrarlo hay que publicarlo de nuevo. Si solo querés sacarlo un tiempo, pausalo.'
              : 'El aviso se cierra en MercadoLibre y no se puede reactivar: para volver a mostrarlo hay que publicarlo de nuevo, como un aviso nuevo (con otra antigüedad y sin sus visitas). Si solo querés sacarlo un tiempo, pausalo.'}
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

/** Vincula un aviso que ya está online en el portal (lo publicó Tokko), pegando su link. */
function LinkListingDialog({
  owner,
  portal,
  plans,
  onClose,
}: {
  readonly owner: ListingOwner;
  readonly portal: PortalValue;
  /** Los planes, en los portales con plan; si no, no se elige. */
  readonly plans: readonly PortalCreditView[] | undefined;
  readonly onClose: () => void;
}) {
  const [remote, setRemote] = useState('');
  const [plan, setPlan] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const site = PORTAL_SITE_NAMES[portal];
  const inputId = `${portal}-remote-listing`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle icon={LinkIcon}>Vincular un aviso de {site}</DialogTitle>
          <DialogDescription>
            Pegá el link del aviso que ya está online en {site} (lo publicó Tokko). No se republica:
            conserva su antigüedad, sus visitas y sus consultas, y queda como está hasta que cambie
            algo{' '}
            {owner.kind === 'development'
              ? 'del emprendimiento o de sus unidades.'
              : 'de la propiedad.'}
            {owner.kind === 'development' &&
              ' Cada unidad del aviso se toma para la unidad con el mismo código; las que no tienen par salen en el próximo envío.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            startTransition(async () => {
              const chosen = plan === undefined ? {} : { plan };
              const message = await runAction(() =>
                owner.kind === 'development'
                  ? linkDevelopmentListingAction({
                      portal,
                      developmentId: owner.id,
                      remoteId: remote,
                      ...chosen,
                    })
                  : linkPortalListingAction({
                      portal,
                      propertyId: owner.id,
                      remoteId: remote,
                      ...chosen,
                    }),
              );
              if (message !== undefined) {
                setError(message);
                return;
              }
              toast.success('Aviso vinculado');
              onClose();
            });
          }}
        >
          <FormAlert message={error} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>Link o número del aviso</Label>
            <Input
              id={inputId}
              autoFocus
              autoComplete="off"
              placeholder={
                portal === 'zonaprop'
                  ? 'https://www.zonaprop.com.ar/propiedades/…-12345678.html'
                  : 'https://inmueble.mercadolibre.com.ar/MLA-1234567890-…'
              }
              value={remote}
              onChange={(event) => {
                setRemote(event.target.value);
              }}
            />
          </div>
          {plans !== undefined && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                {owner.kind === 'development'
                  ? `Plan (opcional: sin elegir, el que informa ${site})`
                  : `Plan, si ${site} no lo informa (opcional)`}
              </span>
              <PlanSelect plans={plans} value={plan} onChange={setPlan} disabled={pending} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || remote.trim() === ''}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Vincular
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString('es-AR')} ${value === 1 ? one : many}`;
}

/**
 * Las visitas y los contactos del aviso, leídos del portal: los del último mes y las visitas desde
 * que se publicó. Si el portal no respondió, el motivo, sin romper la fila.
 */
function ListingStatsLine({ stats }: { readonly stats: ListingStatsResult }) {
  if (!stats.ok) return <p className="text-xs text-muted-foreground">{stats.message}</p>;
  const { days, totalVisits, visits, questions, phoneViews, whatsapp } = stats.stats;
  const items = [
    count(visits, 'visita', 'visitas'),
    count(questions, 'pregunta', 'preguntas'),
    count(phoneViews, 'vio el teléfono', 'vieron el teléfono'),
    count(whatsapp, 'fue al WhatsApp', 'fueron al WhatsApp'),
  ];
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
      <p>
        <span className="text-muted-foreground">Últimos {days} días: </span>
        {items.join(' · ')}
      </p>
      <p className="text-xs text-muted-foreground">
        {count(totalVisits, 'visita', 'visitas')} desde que se publicó.
      </p>
    </div>
  );
}
