import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput } from '../../contracts';
import type { Listing } from '../../domain/listing';
import type { PortalId } from '../../domain/portal';
import {
  auditStatusChange,
  contentFingerprint,
  listingIdOf,
  type ListingNotFoundError,
} from '../listing-support';
import type { ListingSourceReader } from '../ports/listing-source';
import type {
  PortalConnector,
  PortalListingContent,
  PortalListingState,
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
 * con lo que se pidió y el estado de la propiedad, y lo hace. La publicación queda bloqueada
 * mientras dura: dos sincronizaciones a la vez podrían crear dos avisos.
 */
export class SyncListing {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly reader: ListingSourceReader;
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

  async #sync(listing: Listing, accountReady: boolean): Promise<SyncListingOutcome> {
    const { portal, operation, listingType, externalId } = listing.toSnapshot();
    const now = () => this.deps.clock.now();
    const source = await this.deps.reader.read(listing.propertyId);
    const content: PortalListingContent | undefined = source && { source, operation, listingType };
    const hash = content ? contentFingerprint(content) : '';
    const step = listing.plan(source?.availability ?? 'closed', hash);

    if (step.kind === 'none') return 'unchanged';
    if (step.kind === 'mark') {
      if (step.status === 'paused') listing.recordPaused(undefined, now());
      else listing.recordClosed(now());
      return 'synced';
    }

    if (!accountReady) return this.#fail(listing, NOT_ENABLED);
    const remoteId = externalId ?? '';

    if (step.kind === 'close') {
      const closed = await this.deps.connector.close(portal, remoteId);
      if (closed.isErr()) return this.#fail(listing, reasonOf(closed.error), closed.error);
      listing.recordClosed(now());
      return 'synced';
    }

    // Crear o mandar contenido: lo que el portal exige se revisa antes de llamarlo.
    const sendsContent = step.kind === 'create' || step.contentChanged;
    if (sendsContent) {
      const problem = this.#contentProblem(portal, content);
      if (problem !== undefined) return this.#fail(listing, problem);
    }

    if (step.kind === 'create' && content) {
      const created = await this.deps.connector.create(portal, content);
      if (created.isErr()) return this.#fail(listing, reasonOf(created.error), created.error);
      listing.recordCreated({ ...created.value, contentHash: hash, now: now() });
      return 'synced';
    }

    const state = step.kind === 'pause' ? 'paused' : 'active';
    const updated = await this.deps.connector.update(portal, remoteId, {
      content: sendsContent ? content : undefined,
      state,
    });
    if (updated.isErr()) return this.#fail(listing, reasonOf(updated.error), updated.error);
    this.#recordState(listing, updated.value, sendsContent ? hash : undefined);
    return 'synced';
  }

  /** Lo que impide mandar el contenido: precio, operación o lo que exige el portal. */
  #contentProblem(portal: PortalId, content: PortalListingContent | undefined): string | undefined {
    if (!content) return 'La propiedad ya no existe.';
    const offered = content.source.operations.find((o) => o.operation === content.operation);
    if (!offered) return 'La propiedad ya no ofrece esta operación.';
    if (offered.priceOnRequest || offered.priceCents === undefined) {
      return 'El portal exige un precio: la operación está sin precio o con "precio a consultar".';
    }
    const problems = this.deps.connector.problems(portal, content);
    return problems.length > 0 ? problems.join(' ') : undefined;
  }

  #recordState(listing: Listing, state: PortalListingState, hash: string | undefined): void {
    const now = this.deps.clock.now();
    if (state === 'closed') listing.recordClosed(now);
    else if (state === 'paused') listing.recordPaused(hash, now);
    else listing.recordActive(hash ?? listing.toSnapshot().contentHash ?? '', now);
  }

  #fail(listing: Listing, reason: string, error?: PortalSyncError): SyncListingOutcome {
    listing.recordFailure(reason, this.deps.clock.now());
    return error?.type === 'PortalUnavailable' ? 'retry' : 'failed';
  }
}
