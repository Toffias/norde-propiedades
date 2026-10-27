import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type AuditChanges,
  type AuditTarget,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { PropertyListingView } from '../contracts';
import type {
  Listing,
  ListingId,
  ListingOperation,
  ListingOwner,
  ListingStatus,
  RemoteListingState,
} from '../domain/listing';
import type { PortalId } from '../domain/portal';
import type { ListingSourcePhoto } from './ports/listing-source';
import type { PortalListingContent } from './ports/portal-connector';
import type { PortalsTransaction, PortalsUnitOfWork } from './ports/portals-transaction';
import type { ValidationFailedError } from './portals-input';

/** El motivo de una sincronización que falló porque el portal no respondió. */
export const SYNC_UNAVAILABLE = 'El portal no respondió. Se vuelve a intentar en unos minutos.';
/** El motivo de una sincronización que falló porque el portal pidió volver a conectar la cuenta. */
export const SYNC_RECONNECT = 'El portal pide volver a conectar la cuenta (Mi empresa → Portales).';

/**
 * Pide sincronizar las publicaciones bloqueadas que quedaron en error por uno de esos motivos (el
 * portal no respondió, pidió reconectar): no hay nada que corregir en Norde, así que se reintentan
 * solas. Devuelve cuántas pidió.
 */
export async function retryFailedListings(
  deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock },
  ids: readonly ListingId[],
  reasons: readonly string[],
): Promise<number> {
  let requested = 0;
  for (const id of ids) {
    const retried = await deps.uow.run(async (tx) => {
      const listing = await tx.listings.lockById(id);
      const { status, lastError } = listing?.toSnapshot() ?? {};
      if (!listing || status !== 'error' || !reasons.includes(lastError ?? '')) return false;
      listing.requestSync(deps.clock.now());
      await tx.events.publish(listing.pullEvents());
      return true;
    });
    if (retried) requested += 1;
  }
  return requested;
}

/**
 * Refleja en la publicación, bloqueada, cómo está su aviso en el portal (vencido, cerrado, pausado
 * por moderación): la conciliación diaria y la de un aviso que el portal avisó que cambió. Se
 * audita por quien la corre (`system:portal-sync`). Devuelve si cambió.
 */
export async function applyRemoteState(
  deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock },
  id: ListingId,
  state: RemoteListingState,
  actor: Actor,
): Promise<boolean> {
  return deps.uow.run(async (tx) => {
    const listing = await tx.listings.lockById(id);
    if (!listing) return false;
    const before = listing.toSnapshot();
    if (!listing.reconcile(state, deps.clock.now())) return false;
    await tx.listings.save(listing, actor.id);
    await tx.events.publish(listing.pullEvents());
    await auditStatusChange(tx, actor, listing, before.status, { lastError: before.lastError });
    return true;
  });
}

/**
 * La publicación de ese dueño (y operación) en el portal, bloqueada hasta el final de la
 * transacción: un `SyncListing` en curso termina antes de que se la vuelva a pedir, y no se pisa
 * el aviso que creó.
 */
export async function lockExistingListing(
  tx: PortalsTransaction,
  portal: PortalId,
  owner: ListingOwner,
  operation: ListingOperation | undefined,
): Promise<Listing | undefined> {
  const found = await tx.listings.findOne(portal, owner, operation);
  return found && tx.listings.lockById(found.id);
}

export interface ListingNotFoundError {
  readonly type: 'ListingNotFound';
}

export function listingIdOf(raw: string): ListingId | undefined {
  const id = parseId<'Listing'>(raw);
  return id.isOk() ? id.value : undefined;
}

/**
 * Las publicaciones se auditan contra la propiedad o el emprendimiento, para que aparezcan en su
 * historial: `action` es lo que pasó (`portal_published`) y queda `property.portal_published` o
 * `development.portal_published`. No tienen datos de clientes.
 */
export function listingAuditTarget(action: string, listing: Listing): AuditTarget {
  const { kind, id } = listing.owner;
  return { action: `${kind}.${action}`, entityType: kind, entityId: id, clientIds: [] };
}

/**
 * Qué publicación es, para el historial: portal, operación (`null` si el aviso lleva todas), tipo,
 * plan (solo en los portales con plan) y el ID en el portal.
 */
export function listingAuditValue(listing: Listing) {
  const { id, portal, operation, listingType, plan, externalId } = listing.toSnapshot();
  return {
    listingId: id,
    portal,
    operation: operation ?? null,
    listingType,
    ...(plan === undefined ? {} : { plan }),
    externalId: externalId ?? null,
  };
}

/** La acción del historial cuando la publicación cambia de estado en el portal. */
const STATUS_ACTIONS: Readonly<Record<ListingStatus, string | undefined>> = {
  pending: undefined,
  published: 'portal_published',
  paused: 'portal_paused',
  unpublished: 'portal_unpublished',
  error: 'portal_sync_failed',
};

/**
 * Audita el cambio de estado de una publicación; sin cambio de estado, no registra nada. Con
 * `previousError` (la conciliación), suma el motivo que dejó el portal si cambió.
 */
export async function auditStatusChange(
  tx: PortalsTransaction,
  actor: Actor,
  listing: Listing,
  before: ListingStatus,
  previous?: { readonly lastError: string | undefined },
): Promise<void> {
  const { id, status, lastError, externalId, permalink } = listing.toSnapshot();
  const action = STATUS_ACTIONS[status];
  if (status === before || action === undefined) return;
  const changes: Record<string, AuditChanges[string]> = {
    [`listings.${id}.status`]: { before, after: status },
  };
  if (status === 'error')
    changes[`listings.${id}.lastError`] = { before: null, after: lastError ?? null };
  else if (previous && previous.lastError !== lastError) {
    changes[`listings.${id}.lastError`] = {
      before: previous.lastError ?? null,
      after: lastError ?? null,
    };
  }
  if (status === 'published' && before === 'pending') {
    changes[`listings.${id}.externalId`] = { before: null, after: externalId ?? null };
    changes[`listings.${id}.permalink`] = { before: null, after: permalink ?? null };
  }
  await tx.audit.record(auditAction(actor, listingAuditTarget(action, listing), changes));
}

export function toListingView(listing: Listing): PropertyListingView {
  const s = listing.toSnapshot();
  return {
    id: s.id,
    portal: s.portal,
    operation: s.operation,
    listingType: s.listingType,
    plan: s.plan,
    status: s.status,
    intent: s.intent,
    externalId: s.externalId,
    permalink: s.permalink,
    lastError: s.lastError,
    lastSyncedAt: s.lastSyncedAt,
    publishedAt: s.publishedAt,
  };
}

/** Las fotos en la huella: su ID y su versión, sin la URL firmada. */
function comparablePhotos(photos: readonly ListingSourcePhoto[]) {
  return photos.map((photo) => [photo.id, photo.version]);
}

/**
 * Huella de lo que se manda al portal. Deja afuera las URLs firmadas (cambian en cada lectura) y
 * el ID de la publicación (no cambia), y usa la versión de cada foto. FNV-1a de 64 bits sobre el
 * JSON con las claves ordenadas: no es criptográfica, alcanza para saber si algo cambió. Un campo
 * sin valor no entra, así que sumar campos opcionales no cambia la huella de los avisos de antes.
 * La de una propiedad no lleva el tipo de contenido: es la misma que antes de los emprendimientos.
 */
export function contentFingerprint(content: PortalListingContent): string {
  if (content.kind === 'development') {
    const { source, listingType, plan } = content;
    return fnv1a64(
      canonicalJson({
        ...source,
        photos: comparablePhotos(source.photos),
        units: source.units.map((unit) => ({ ...unit, photos: comparablePhotos(unit.photos) })),
        listingType,
        plan,
      }),
    );
  }
  const { source, operation, listingType, plan } = content;
  const comparable = {
    ...source,
    photos: comparablePhotos(source.photos),
    operation,
    listingType,
    plan,
  };
  return fnv1a64(canonicalJson(comparable));
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === undefined) return 'null';
  if (Array.isArray(value))
    return `[${value.map((item: unknown) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, field]: [string, unknown]) => `${JSON.stringify(key)}:${canonicalJson(field)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

export type ListingEditError = ForbiddenError | ValidationFailedError | ListingNotFoundError;

/**
 * Un cambio del equipo sobre una publicación (pausar, reactivar, dar de baja, cambiar el tipo):
 * permiso `portals:publish`, se guarda, se piden los eventos y se audita con la acción dada
 * (`portal_paused`), contra la propiedad o el emprendimiento.
 */
export async function editListing<E>(input: {
  readonly uow: PortalsUnitOfWork;
  readonly actor: Actor;
  readonly listingId: string;
  readonly action: string;
  readonly change: (listing: Listing) => Result<AuditChanges | undefined, E>;
}): Promise<Result<void, ListingEditError | E>> {
  const { uow, actor } = input;
  if (!actor.can('portals:publish')) return err({ type: 'Forbidden' });
  const id = listingIdOf(input.listingId);
  if (id === undefined) return err({ type: 'ListingNotFound' });

  return uow.run(async (tx): Promise<Result<void, ListingEditError | E>> => {
    // Bloqueada: si `SyncListing` está creando el aviso, se espera y no se pisa su `externalId`.
    const listing = await tx.listings.lockById(id);
    if (!listing) return err({ type: 'ListingNotFound' });
    const changed = input.change(listing);
    if (changed.isErr()) return err(changed.error);
    if (changed.value === undefined) return ok(undefined);

    await tx.listings.save(listing, actor.id);
    await tx.events.publish(listing.pullEvents());
    await tx.audit.record(
      auditAction(actor, listingAuditTarget(input.action, listing), changed.value),
    );
    return ok(undefined);
  });
}
