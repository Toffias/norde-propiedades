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
import { RequestPublicationInputSchema, type RequestPublicationInput } from '../../contracts';
import { Listing, type ListingNotClosedError } from '../../domain/listing';
import { PORTAL_CATALOG, type PortalId } from '../../domain/portal';
import { listingAuditTarget, listingAuditValue } from '../listing-support';
import type { ListingSourceReader } from '../ports/listing-source';
import type { PortalConnector } from '../ports/portal-connector';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

/** La cuenta del portal no está conectada o no está activa. */
export interface PortalNotEnabledError {
  readonly type: 'PortalNotEnabled';
  readonly portal: PortalId;
}

/** Esa cuenta publica emprendimientos, no propiedades sueltas. */
export interface PortalNotForPropertiesError {
  readonly type: 'PortalNotForProperties';
}

export interface ListingPropertyNotFoundError {
  readonly type: 'PropertyNotFound';
}

/** Una unidad se publica dentro de su emprendimiento, no como aviso suelto. */
export interface UnitPublishedWithDevelopmentError {
  readonly type: 'UnitPublishedWithDevelopment';
}

/** Solo se publica una propiedad disponible. */
export interface PropertyNotAvailableError {
  readonly type: 'PropertyNotAvailable';
}

export interface OperationNotOfferedError {
  readonly type: 'OperationNotOffered';
}

/** El portal exige un precio: sin precio o con "precio a consultar", no se publica. */
export interface PriceRequiredError {
  readonly type: 'PriceRequired';
}

/** Le faltan datos que el portal exige ("Falta la superficie cubierta"). */
export interface MissingListingDataError {
  readonly type: 'MissingListingData';
  readonly problems: readonly string[];
}

/** Ya hay un aviso de esa operación en ese portal. */
export interface ListingAlreadyExistsError {
  readonly type: 'ListingAlreadyExists';
}

export type RequestPublicationError =
  | ForbiddenError
  | ValidationFailedError
  | PortalNotEnabledError
  | PortalNotForPropertiesError
  | ListingPropertyNotFoundError
  | UnitPublishedWithDevelopmentError
  | PropertyNotAvailableError
  | OperationNotOfferedError
  | PriceRequiredError
  | MissingListingDataError
  | ListingAlreadyExistsError
  | ListingNotClosedError;

/**
 * Publicar una operación de una propiedad en un portal, a pedido del equipo. Revisa lo que exige
 * el portal antes de pedirlo: el aviso lo crea después un job (`SyncListing`). Si la operación ya
 * estuvo publicada y se dio de baja, vuelve a publicarla (un aviso nuevo).
 */
export class RequestPublication {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly reader: ListingSourceReader;
      readonly connector: PortalConnector;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RequestPublicationInput,
    actor: Actor,
  ): Promise<Result<{ readonly listingId: string }, RequestPublicationError>> {
    if (!actor.can('portals:publish')) return err({ type: 'Forbidden' });
    const parsed = parseInput(RequestPublicationInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { propertyId, portal, operation, listingType } = parsed.value;
    if (PORTAL_CATALOG[portal].publishes !== 'property') {
      return err({ type: 'PortalNotForProperties' });
    }

    const source = await this.deps.reader.read(propertyId);
    if (!source) return err({ type: 'PropertyNotFound' });
    if (source.developmentId !== undefined) return err({ type: 'UnitPublishedWithDevelopment' });
    if (source.availability !== 'active') return err({ type: 'PropertyNotAvailable' });
    const offered = source.operations.find((o) => o.operation === operation);
    if (!offered) return err({ type: 'OperationNotOffered' });
    if (offered.priceOnRequest || offered.priceCents === undefined) {
      return err({ type: 'PriceRequired' });
    }
    const problems = this.deps.connector.problems(portal, { source, operation, listingType });
    if (problems.length > 0) return err({ type: 'MissingListingData', problems });

    const now = this.deps.clock.now();
    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly listingId: string }, RequestPublicationError>> => {
        const account = await tx.accounts.get(portal);
        if (!account.canPublish) return err({ type: 'PortalNotEnabled', portal });

        const existing = await tx.listings.findOne(portal, propertyId, operation);
        let listing: Listing;
        if (existing) {
          const republished = existing.republish(listingType, now);
          if (republished.isErr()) return err({ type: 'ListingAlreadyExists' });
          listing = existing;
        } else {
          const id = parseId<'Listing'>(this.deps.ids.next());
          if (id.isErr()) throw new Error('The id generator returned an invalid id');
          listing = Listing.request({
            id: id.value,
            portal,
            propertyId,
            operation,
            listingType,
            now,
          });
        }

        await tx.listings.save(listing, actor.id);
        await tx.events.publish(listing.pullEvents());
        await tx.audit.record(
          auditAction(actor, listingAuditTarget('property.portal_publish_requested', listing), {
            [`listings.${listing.id}`]: { before: null, after: listingAuditValue(listing) },
          }),
        );
        return ok({ listingId: listing.id });
      },
    );
  }
}
