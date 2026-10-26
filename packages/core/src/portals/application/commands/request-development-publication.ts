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
import {
  RequestDevelopmentPublicationInputSchema,
  type RequestDevelopmentPublicationInput,
} from '../../contracts';
import { Listing, type ListingNotClosedError } from '../../domain/listing';
import { PORTAL_CATALOG, portalPublishes } from '../../domain/portal';
import { checkPlanCredits, type ListingPlanError, type PlanRequiredError } from '../listing-plan';
import { listingAuditTarget, listingAuditValue, lockExistingListing } from '../listing-support';
import type { DevelopmentListingSourceReader } from '../ports/development-listing-source';
import type { PortalAccountDirectory } from '../ports/portal-account-directory';
import type { PortalConnector } from '../ports/portal-connector';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';
import type {
  ListingAlreadyExistsError,
  MissingListingDataError,
  PortalNotEnabledError,
} from './request-publication';

/** Esa cuenta no publica emprendimientos. */
export interface PortalNotForDevelopmentsError {
  readonly type: 'PortalNotForDevelopments';
}

export interface ListingDevelopmentNotFoundError {
  readonly type: 'DevelopmentNotFound';
}

/** Solo se publica un emprendimiento "comercializando" (no uno que está cargando información). */
export interface DevelopmentNotMarketingError {
  readonly type: 'DevelopmentNotMarketing';
}

/** Ninguna unidad está disponible con precio: el aviso no tendría unidades. */
export interface NoPublishableUnitsError {
  readonly type: 'NoPublishableUnits';
}

export type RequestDevelopmentPublicationError =
  | ForbiddenError
  | ValidationFailedError
  | PortalNotEnabledError
  | PortalNotForDevelopmentsError
  | ListingDevelopmentNotFoundError
  | DevelopmentNotMarketingError
  | NoPublishableUnitsError
  | MissingListingDataError
  | PlanRequiredError
  | ListingPlanError
  | ListingAlreadyExistsError
  | ListingNotClosedError;

/**
 * Publicar un emprendimiento en un portal, a pedido del equipo: un aviso con sus unidades
 * disponibles con precio, con el plan elegido entre los de emprendimientos (Zonaprop). Revisa lo que
 * exige el portal antes de pedirlo: el aviso lo crea después un job (`SyncListing`). Si ya estuvo
 * publicado y se dio de baja, lo vuelve a publicar (un aviso nuevo).
 */
export class RequestDevelopmentPublication {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly developments: DevelopmentListingSourceReader;
      readonly connector: PortalConnector;
      readonly directory: PortalAccountDirectory;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RequestDevelopmentPublicationInput,
    actor: Actor,
  ): Promise<Result<{ readonly listingId: string }, RequestDevelopmentPublicationError>> {
    if (!actor.can('portals:publish')) return err({ type: 'Forbidden' });
    const parsed = parseInput(RequestDevelopmentPublicationInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { developmentId, portal, plan } = parsed.value;
    if (!portalPublishes(portal, 'development')) return err({ type: 'PortalNotForDevelopments' });
    const { choosesPlan } = PORTAL_CATALOG[portal];
    if (choosesPlan && plan === undefined) return err({ type: 'PlanRequired' });
    if (!choosesPlan && plan !== undefined) {
      return err({ type: 'ValidationFailed', issues: ['Este portal no usa planes.'] });
    }

    const source = await this.deps.developments.read(developmentId);
    if (!source) return err({ type: 'DevelopmentNotFound' });
    if (source.units.length === 0) return err({ type: 'NoPublishableUnits' });
    if (source.availability !== 'active') return err({ type: 'DevelopmentNotMarketing' });

    // El id se elige antes: el conector lo usa como código del aviso en algunos portales.
    const newId = parseId<'Listing'>(this.deps.ids.next());
    if (newId.isErr()) throw new Error('The id generator returned an invalid id');
    const problems = this.deps.connector.problems(portal, {
      kind: 'development',
      listingId: newId.value,
      source,
      listingType: 'simple',
      plan,
    });
    if (problems.length > 0) return err({ type: 'MissingListingData', problems });

    if (plan !== undefined) {
      const account = await this.deps.uow.run((tx) => tx.accounts.get(portal));
      const connection = account.toSnapshot().connection;
      if (!account.canPublish || connection === undefined) {
        return err({ type: 'PortalNotEnabled', portal });
      }
      const credits = await checkPlanCredits(this.deps.directory, {
        portal,
        externalAccountId: connection.externalAccountId,
        plan,
        publishes: 'development',
      });
      if (credits.isErr()) return err(credits.error);
    }

    const now = this.deps.clock.now();
    const owner = { kind: 'development', id: developmentId } as const;
    return this.deps.uow.run(
      async (
        tx,
      ): Promise<Result<{ readonly listingId: string }, RequestDevelopmentPublicationError>> => {
        const account = await tx.accounts.get(portal);
        if (!account.canPublish) return err({ type: 'PortalNotEnabled', portal });

        const existing = await lockExistingListing(tx, portal, owner, undefined);
        let listing: Listing;
        if (existing) {
          const republished = existing.republish({ listingType: 'simple', plan }, now);
          if (republished.isErr()) return err({ type: 'ListingAlreadyExists' });
          listing = existing;
        } else {
          listing = Listing.request({
            id: newId.value,
            portal,
            owner,
            operation: undefined,
            listingType: 'simple',
            plan,
            now,
          });
        }

        await tx.listings.save(listing, actor.id);
        await tx.events.publish(listing.pullEvents());
        await tx.audit.record(
          auditAction(actor, listingAuditTarget('portal_publish_requested', listing), {
            [`listings.${listing.id}`]: { before: null, after: listingAuditValue(listing) },
          }),
        );
        return ok({ listingId: listing.id });
      },
    );
  }
}
