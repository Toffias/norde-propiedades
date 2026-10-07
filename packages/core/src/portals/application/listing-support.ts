import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type AuditChanges,
  type AuditTarget,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { PropertyListingView } from '../contracts';
import type { Listing, ListingId, ListingStatus } from '../domain/listing';
import type { PortalListingContent } from './ports/portal-connector';
import type { PortalsTransaction, PortalsUnitOfWork } from './ports/portals-transaction';
import type { ValidationFailedError } from './portals-input';

export interface ListingNotFoundError {
  readonly type: 'ListingNotFound';
}

export function listingIdOf(raw: string): ListingId | undefined {
  const id = parseId<'Listing'>(raw);
  return id.isOk() ? id.value : undefined;
}

/**
 * Las publicaciones se auditan contra la propiedad, para que aparezcan en su historial
 * (`property.portal_published`). No tienen datos de clientes.
 */
export function listingAuditTarget(action: string, listing: Listing): AuditTarget {
  return { action, entityType: 'property', entityId: listing.propertyId, clientIds: [] };
}

/** Qué publicación es, para el historial: portal, operación, tipo y el ID en el portal. */
export function listingAuditValue(listing: Listing) {
  const { id, portal, operation, listingType, externalId } = listing.toSnapshot();
  return { listingId: id, portal, operation, listingType, externalId: externalId ?? null };
}

/** La acción del historial cuando la publicación cambia de estado en el portal. */
const STATUS_ACTIONS: Readonly<Record<ListingStatus, string | undefined>> = {
  pending: undefined,
  published: 'property.portal_published',
  paused: 'property.portal_paused',
  unpublished: 'property.portal_unpublished',
  error: 'property.portal_sync_failed',
};

/** Audita el cambio de estado de una publicación; sin cambio de estado, no registra nada. */
export async function auditStatusChange(
  tx: PortalsTransaction,
  actor: Actor,
  listing: Listing,
  before: ListingStatus,
): Promise<void> {
  const { id, status, lastError, externalId, permalink } = listing.toSnapshot();
  const action = STATUS_ACTIONS[status];
  if (status === before || action === undefined) return;
  const changes: Record<string, AuditChanges[string]> = {
    [`listings.${id}.status`]: { before, after: status },
  };
  if (status === 'error')
    changes[`listings.${id}.lastError`] = { before: null, after: lastError ?? null };
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
    status: s.status,
    intent: s.intent,
    externalId: s.externalId,
    permalink: s.permalink,
    lastError: s.lastError,
    lastSyncedAt: s.lastSyncedAt,
    publishedAt: s.publishedAt,
  };
}

/**
 * Huella de lo que se manda al portal. Deja afuera las URLs firmadas (cambian en cada lectura) y
 * usa la versión de cada foto. FNV-1a de 64 bits sobre el JSON con las claves ordenadas: no es
 * criptográfica, alcanza para saber si algo cambió.
 */
export function contentFingerprint(content: PortalListingContent): string {
  const { source, operation, listingType } = content;
  const comparable = {
    ...source,
    photos: source.photos.map((photo) => [photo.id, photo.version]),
    operation,
    listingType,
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
 * permiso `portals:publish`, se guarda, se piden los eventos y se audita con la acción dada.
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
    const listing = await tx.listings.findById(id);
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
