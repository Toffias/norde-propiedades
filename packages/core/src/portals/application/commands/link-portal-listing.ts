import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { LinkPortalListingInputSchema, type LinkPortalListingInput } from '../../contracts';
import { Listing, type ListingOwner } from '../../domain/listing';
import { PORTAL_CATALOG } from '../../domain/portal';
import type { PlanRequiredError } from '../listing-plan';
import { contentFingerprint, listingAuditTarget, listingAuditValue } from '../listing-support';
import type { ListingSourceReader } from '../ports/listing-source';
import type { PortalNotConfiguredError, PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalSyncError } from '../ports/portal-connector';
import type { PortalListingCatalog } from '../ports/portal-listing-catalog';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';
import type {
  ListingAlreadyExistsError,
  ListingPropertyNotFoundError,
  PortalNotEnabledError,
  UnitPublishedWithDevelopmentError,
} from './request-publication';

/** El portal no tiene online un aviso con ese número en la cuenta. */
export interface RemoteListingNotFoundError {
  readonly type: 'RemoteListingNotFound';
}

/** Es un emprendimiento: se vincula con los emprendimientos, no con una propiedad. */
export interface RemoteListingIsDevelopmentError {
  readonly type: 'RemoteListingIsDevelopment';
}

/** Ese aviso ya está vinculado a una publicación del sistema. */
export interface RemoteListingAlreadyLinkedError {
  readonly type: 'RemoteListingAlreadyLinked';
  readonly owner: ListingOwner;
}

export type LinkPortalListingError =
  | ForbiddenError
  | ValidationFailedError
  | PortalNotEnabledError
  | ListingPropertyNotFoundError
  | UnitPublishedWithDevelopmentError
  | RemoteListingNotFoundError
  | RemoteListingIsDevelopmentError
  | RemoteListingAlreadyLinkedError
  | ListingAlreadyExistsError
  | PlanRequiredError
  | PortalNotConfiguredError
  | PortalUnavailableError
  | PortalSyncError;

/**
 * Vincula a una propiedad un aviso que ya está online en el portal (lo publicó Tokko), sin
 * republicarlo: conserva su antigüedad, visitas y consultas. El portal pasa a manejarlo con el
 * código de Norde. El aviso queda como está hasta que cambie algo de la propiedad; ahí lo actualiza
 * la sincronización de siempre. Las llamadas al portal van antes de la transacción.
 */
export class LinkPortalListing {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly catalog: PortalListingCatalog;
      readonly reader: ListingSourceReader;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: LinkPortalListingInput,
    actor: Actor,
  ): Promise<Result<{ readonly listingId: string }, LinkPortalListingError>> {
    if (!actor.can('portals:publish')) return err({ type: 'Forbidden' });
    const parsed = parseInput(LinkPortalListingInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal, propertyId, remoteId } = parsed.value;
    const definition = PORTAL_CATALOG[portal];
    if (!definition.linksExisting) {
      return err({
        type: 'ValidationFailed',
        issues: ['Este portal no vincula avisos existentes.'],
      });
    }

    const { account, existing } = await this.deps.uow.run(async (tx) => ({
      account: await tx.accounts.get(portal),
      existing: await tx.listings.findOne(portal, { kind: 'property', id: propertyId }, undefined),
    }));
    const connection = account.toSnapshot().connection;
    if (!account.canPublish || connection === undefined) {
      return err({ type: 'PortalNotEnabled', portal });
    }
    if (existing && existing.toSnapshot().intent !== 'closed') {
      return err({ type: 'ListingAlreadyExists' });
    }

    const source = await this.deps.reader.read(propertyId);
    if (!source) return err({ type: 'PropertyNotFound' });
    if (source.developmentId !== undefined) return err({ type: 'UnitPublishedWithDevelopment' });

    const found = await this.deps.catalog.online({
      portal,
      externalAccountId: connection.externalAccountId,
      offset: 0,
      limit: 1,
      remoteId,
    });
    if (found.isErr()) return err(found.error);
    const remote = found.value.items.find((r) => r.remoteId === remoteId);
    if (!remote) return err({ type: 'RemoteListingNotFound' });
    if (remote.isDevelopment) return err({ type: 'RemoteListingIsDevelopment' });
    if (remote.code !== undefined) {
      const [linked] = await this.deps.uow.run((tx) =>
        tx.listings.findByExternalIds(portal, [remote.code ?? '']),
      );
      if (linked && linked.toSnapshot().intent !== 'closed') {
        return err({ type: 'RemoteListingAlreadyLinked', owner: linked.owner });
      }
    }
    const plan = remote.plan ?? parsed.value.plan;
    if (definition.choosesPlan && plan === undefined) return err({ type: 'PlanRequired' });

    // Una publicación dada de baja de la misma propiedad se reutiliza: hay una sola por portal.
    let listingId = existing?.id;
    if (listingId === undefined) {
      const id = parseId<'Listing'>(this.deps.ids.next());
      if (id.isErr()) throw new Error('The id generator returned an invalid id');
      listingId = id.value;
    }
    const taken = await this.deps.catalog.link({
      portal,
      externalAccountId: connection.externalAccountId,
      remoteId,
      listingId,
    });
    if (taken.isErr()) return err(taken.error);

    const now = this.deps.clock.now();
    const adopted = {
      plan,
      externalId: taken.value.externalId,
      permalink: taken.value.permalink ?? remote.permalink,
      // La huella de hoy: el aviso no se reenvía hasta que cambie algo de la propiedad.
      contentHash: contentFingerprint({
        kind: 'property',
        listingId,
        source,
        operation: undefined,
        listingType: 'simple',
        plan,
      }),
      now,
    };
    let listing: Listing;
    if (existing) {
      const relinked = existing.adopt(adopted);
      if (relinked.isErr()) return err({ type: 'ListingAlreadyExists' });
      listing = existing;
    } else {
      listing = Listing.linked({
        id: listingId,
        portal,
        owner: { kind: 'property', id: propertyId },
        operation: undefined,
        ...adopted,
      });
    }

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly listingId: string }, LinkPortalListingError>> => {
        await tx.listings.save(listing, actor.id);
        await tx.events.publish(listing.pullEvents());
        await tx.audit.record(
          auditAction(actor, listingAuditTarget('portal_listing_linked', listing), {
            [`listings.${listing.id}`]: {
              before: null,
              after: { ...listingAuditValue(listing), remoteId },
            },
          }),
        );
        return ok({ listingId: listing.id });
      },
    );
  }
}
