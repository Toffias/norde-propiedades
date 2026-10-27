import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput } from '../../contracts';
import type { Listing, OwnerAvailability } from '../../domain/listing';
import type { ListingOwnerKind, PortalId } from '../../domain/portal';
import { listingAvailability, pricedOperations } from '../listing-plan';
import {
  auditStatusChange,
  contentFingerprint,
  listingIdOf,
  type ListingNotFoundError,
} from '../listing-support';
import type { DevelopmentListingSourceReader } from '../ports/development-listing-source';
import type { ListingSourceReader } from '../ports/listing-source';
import type {
  PortalConnector,
  PortalListingContent,
  PortalListingUpdate,
  PortalSyncError,
} from '../ports/portal-connector';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type SyncListingError = ForbiddenError | ValidationFailedError | ListingNotFoundError;

/**
 * Cómo terminó: `synced` (el portal quedó al día), `unchanged` (no había nada que mandar),
 * `failed` (el portal lo rechazó: queda el motivo) o `retry` (el portal no respondió: el job
 * reintenta).
 */
export type SyncListingOutcome = 'synced' | 'unchanged' | 'failed' | 'retry';

const NOT_ENABLED =
  'La cuenta del portal no está conectada o está desactivada (Mi empresa → Portales).';
const RECONNECT = 'El portal pide volver a conectar la cuenta (Mi empresa → Portales).';
const UNAVAILABLE = 'El portal no respondió. Se vuelve a intentar en unos minutos.';
const GONE: Readonly<Record<ListingOwnerKind, string>> = {
  property: 'La propiedad ya no existe.',
  development: 'El emprendimiento ya no existe.',
};
const NO_UNITS =
  'El emprendimiento no tiene unidades disponibles con precio: el portal pide al menos una.';

function reasonOf(error: PortalSyncError): string {
  switch (error.type) {
    case 'PortalRejected':
      return error.reason;
    case 'PortalCredentialsMissing':
      return RECONNECT;
    case 'PortalUnavailable':
      return UNAVAILABLE;
  }
}

/**
 * El job que lleva una publicación al portal. Decide qué hacer (crear, actualizar, pausar, cerrar)
 * con lo que se pidió y el estado de la propiedad (o del emprendimiento y sus unidades), y lo hace. La publicación queda bloqueada
 * mientras dura: dos sincronizaciones a la vez podrían crear dos avisos.
 */
export class SyncListing {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly reader: ListingSourceReader;
      readonly developments: DevelopmentListingSourceReader;
      readonly connector: PortalConnector;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ListingIdInput,
    actor: Actor,
  ): Promise<Result<SyncListingOutcome, SyncListingError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListingIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = listingIdOf(parsed.value.listingId);
    if (id === undefined) return err({ type: 'ListingNotFound' });

    return this.deps.uow.run(async (tx): Promise<Result<SyncListingOutcome, SyncListingError>> => {
      const listing = await tx.listings.lockById(id);
      if (!listing) return err({ type: 'ListingNotFound' });
      if (listing.isFinished) return ok('unchanged');

      const before = listing.toSnapshot().status;
      const account = await tx.accounts.get(listing.portal);
      const outcome = await this.#sync(listing, account.canPublish);
      if (outcome === 'unchanged') return ok(outcome);

      await tx.listings.save(listing, actor.id);
      await tx.events.publish(listing.pullEvents());
      await auditStatusChange(tx, actor, listing, before);
      return ok(outcome);
    });
  }

  /** Lo que se manda hoy al portal y lo que permite el dueño; sin dueño, el aviso se cierra. */
  async #content(listing: Listing): Promise<{
    readonly content: PortalListingContent | undefined;
    readonly availability: OwnerAvailability;
    readonly pausedReason?: string | undefined;
  }> {
    const { owner, operation, listingType, plan } = listing.toSnapshot();
    if (owner.kind === 'development') {
      const source = await this.deps.developments.read(owner.id);
      return source
        ? {
            content: { kind: 'development', listingId: listing.id, source, listingType, plan },
            availability: source.availability,
          }
        : { content: undefined, availability: 'closed' };
    }
    const source = await this.deps.reader.read(owner.id);
    return source
      ? {
          content: {
            kind: 'property',
            listingId: listing.id,
            source,
            operation,
            listingType,
            plan,
          },
          ...listingAvailability(source, operation),
        }
      : { content: undefined, availability: 'closed' };
  }

  async #sync(listing: Listing, accountReady: boolean): Promise<SyncListingOutcome> {
    const { portal, externalId, owner, status, lastError } = listing.toSnapshot();
    const now = () => this.deps.clock.now();
    const { content, availability, pausedReason } = await this.#content(listing);
    const hash = content ? contentFingerprint(content) : '';
    const step = listing.plan(availability, hash);

    if (step.kind === 'none') return 'unchanged';
    if (step.kind === 'mark') {
      if (step.status === 'paused') listing.recordPaused(undefined, now(), pausedReason);
      else listing.recordClosed(now());
      return 'synced';
    }

    if (!accountReady) return this.#fail(listing, NOT_ENABLED);
    const remoteId = externalId ?? '';

    if (step.kind === 'close') {
      const closed = await this.deps.connector.close(portal, remoteId, owner.kind);
      if (closed.isErr()) return this.#fail(listing, reasonOf(closed.error), closed.error);
      listing.recordClosed(now());
      return 'synced';
    }

    // Sin dueño no hay contenido, y el plan ya habría cerrado el aviso.
    if (!content) return this.#fail(listing, GONE[owner.kind]);

    if (step.kind === 'pause') {
      // Pausar no puede fallar por el contenido: con contenido inválido (sin precio, sin
      // coordenadas), se pausa sin mandarlo y se manda al reactivar.
      const sendsContent =
        step.contentChanged && this.#contentProblem(portal, content, false) === undefined;
      if (!sendsContent && status === 'paused') {
        if (lastError === pausedReason) return 'unchanged';
        listing.recordPaused(undefined, now(), pausedReason);
        return 'synced';
      }
      const paused = await this.deps.connector.update(portal, remoteId, {
        content,
        contentChanged: sendsContent,
        state: 'paused',
      });
      if (paused.isErr()) return this.#fail(listing, reasonOf(paused.error), paused.error);
      this.#recordState(listing, paused.value, sendsContent ? hash : undefined, pausedReason);
      return 'synced';
    }

    // Crear o mandar contenido: lo que el portal exige se revisa antes de llamarlo.
    const sendsContent = step.kind === 'create' || step.contentChanged;
    if (sendsContent) {
      const problem = this.#contentProblem(portal, content, true);
      if (problem !== undefined) return this.#fail(listing, problem);
    }

    if (step.kind === 'create') {
      const created = await this.deps.connector.create(portal, content);
      if (created.isErr()) return this.#fail(listing, reasonOf(created.error), created.error);
      listing.recordCreated({ ...created.value, contentHash: hash, now: now() });
      return 'synced';
    }

    const updated = await this.deps.connector.update(portal, remoteId, {
      content,
      contentChanged: sendsContent,
      state: 'active',
    });
    if (updated.isErr()) return this.#fail(listing, reasonOf(updated.error), updated.error);
    this.#recordState(listing, updated.value, sendsContent ? hash : undefined);
    return 'synced';
  }

  /**
   * Lo que impide mandar el contenido: precio, operación, unidades o lo que exige el portal. Un
   * emprendimiento que se pausa por quedarse sin unidades no exige unidades (`online` falso).
   */
  #contentProblem(
    portal: PortalId,
    content: PortalListingContent,
    online: boolean,
  ): string | undefined {
    if (content.kind === 'development') {
      if (online && content.source.units.length === 0) return NO_UNITS;
    } else {
      const { source, operation } = content;
      if (operation !== undefined && !source.operations.some((o) => o.operation === operation)) {
        return 'La propiedad ya no ofrece esta operación.';
      }
      if (pricedOperations(source, operation).length === 0) {
        return operation === undefined
          ? 'El portal exige un precio: ninguna operación tiene precio (o todas están "a consultar").'
          : 'El portal exige un precio: la operación está sin precio o con "precio a consultar".';
      }
    }
    const problems = this.deps.connector.problems(portal, content);
    return problems.length > 0 ? problems.join(' ') : undefined;
  }

  #recordState(
    listing: Listing,
    update: PortalListingUpdate,
    hash: string | undefined,
    pausedReason?: string,
  ): void {
    const now = this.deps.clock.now();
    const { state, permalink } = update;
    if (state === 'closed') listing.recordClosed(now);
    else if (state === 'paused') listing.recordPaused(hash, now, pausedReason);
    else listing.recordActive(hash ?? listing.toSnapshot().contentHash ?? '', now, permalink);
  }

  #fail(listing: Listing, reason: string, error?: PortalSyncError): SyncListingOutcome {
    listing.recordFailure(reason, this.deps.clock.now());
    return error?.type === 'PortalUnavailable' ? 'retry' : 'failed';
  }
}
