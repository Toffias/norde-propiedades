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
  LinkDevelopmentListingInputSchema,
  type LinkDevelopmentListingInput,
} from '../../contracts';
import { Listing } from '../../domain/listing';
import { PORTAL_CATALOG, portalPublishes } from '../../domain/portal';
import type { PlanRequiredError } from '../listing-plan';
import { contentFingerprint, listingAuditTarget, listingAuditValue } from '../listing-support';
import type { DevelopmentListingSourceReader } from '../ports/development-listing-source';
import type { PortalNotConfiguredError, PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalSyncError } from '../ports/portal-connector';
import type { PortalListingCatalog } from '../ports/portal-listing-catalog';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';
import type {
  RemoteListingAlreadyLinkedError,
  RemoteListingNotFoundError,
} from './link-portal-listing';
import type {
  ListingDevelopmentNotFoundError,
  PortalNotForDevelopmentsError,
} from './request-development-publication';
import type { ListingAlreadyExistsError, PortalNotEnabledError } from './request-publication';

export type LinkDevelopmentListingError =
  | ForbiddenError
  | ValidationFailedError
  | PortalNotEnabledError
  | PortalNotForDevelopmentsError
  | ListingDevelopmentNotFoundError
  | RemoteListingNotFoundError
  | RemoteListingAlreadyLinkedError
  | ListingAlreadyExistsError
  | PlanRequiredError
  | PortalNotConfiguredError
  | PortalUnavailableError
  | PortalSyncError;

/**
 * Vincula a un emprendimiento el aviso que ya está online en el portal (lo publicó Tokko), con sus
 * unidades, sin republicarlo. Cada unidad del portal se toma para la unidad de Norde con el mismo
 * código de referencia; las que no tienen par quedan afuera en el próximo envío (el portal recibe
 * siempre la lista completa de unidades). El aviso queda como está hasta que cambie algo del
 * emprendimiento o de sus unidades. Las llamadas al portal van antes de la transacción.
 */
export class LinkDevelopmentListing {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly catalog: PortalListingCatalog;
      readonly developments: DevelopmentListingSourceReader;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: LinkDevelopmentListingInput,
    actor: Actor,
  ): Promise<
    Result<
      { readonly listingId: string; readonly linkedUnits: number },
      LinkDevelopmentListingError
    >
  > {
    if (!actor.can('portals:publish')) return err({ type: 'Forbidden' });
    const parsed = parseInput(LinkDevelopmentListingInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal, developmentId, remoteId } = parsed.value;
    const definition = PORTAL_CATALOG[portal];
    if (!portalPublishes(portal, 'development')) return err({ type: 'PortalNotForDevelopments' });
    if (!definition.linksExisting) {
      return err({
        type: 'ValidationFailed',
        issues: ['Este portal no vincula avisos existentes.'],
      });
    }

    const owner = { kind: 'development', id: developmentId } as const;
    const { account, existing } = await this.deps.uow.run(async (tx) => ({
      account: await tx.accounts.get(portal),
      existing: await tx.listings.findOne(portal, owner, undefined),
    }));
    const connection = account.toSnapshot().connection;
    if (!account.canPublish || connection === undefined) {
      return err({ type: 'PortalNotEnabled', portal });
    }
    if (existing && existing.toSnapshot().intent !== 'closed') {
      return err({ type: 'ListingAlreadyExists' });
    }

    const source = await this.deps.developments.read(developmentId);
    if (!source) return err({ type: 'DevelopmentNotFound' });

    const found = await this.deps.catalog.onlineDevelopments({
      portal,
      externalAccountId: connection.externalAccountId,
      offset: 0,
      limit: 1,
      remoteId,
    });
    if (found.isErr()) return err(found.error);
    const remote = found.value.items.find((r) => r.remoteId === remoteId);
    if (!remote) return err({ type: 'RemoteListingNotFound' });
    if (remote.code !== undefined) {
      const [linked] = await this.deps.uow.run((tx) =>
        tx.listings.findByExternalIds(portal, [remote.code ?? '']),
      );
      if (linked && linked.toSnapshot().intent !== 'closed') {
        return err({ type: 'RemoteListingAlreadyLinked', owner: linked.owner });
      }
    }
    // El plan elegido manda: Tokko informa planes de emprendimientos que la API no acepta al
    // publicar (`DESARROLLO_SUPER_DESTACADOS`).
    const plan = parsed.value.plan ?? remote.plan;
    if (definition.choosesPlan && plan === undefined) return err({ type: 'PlanRequired' });

    // Cada unidad del portal, con la unidad de Norde del mismo código.
    const unitsByCode = new Map(source.units.map((unit) => [unit.code, unit.propertyId]));
    const units = remote.units.flatMap((unit) => {
      const propertyId = unit.reference === undefined ? undefined : unitsByCode.get(unit.reference);
      return propertyId === undefined ? [] : [{ remoteId: unit.remoteId, propertyId }];
    });

    // Una publicación dada de baja del mismo emprendimiento se reutiliza: hay una sola por portal.
    let listingId = existing?.id;
    if (listingId === undefined) {
      const id = parseId<'Listing'>(this.deps.ids.next());
      if (id.isErr()) throw new Error('The id generator returned an invalid id');
      listingId = id.value;
    }
    const taken = await this.deps.catalog.linkDevelopment({
      portal,
      externalAccountId: connection.externalAccountId,
      remoteId,
      listingId,
      units,
    });
    if (taken.isErr()) return err(taken.error);

    const now = this.deps.clock.now();
    const adopted = {
      plan,
      externalId: taken.value.externalId,
      permalink: taken.value.permalink ?? remote.permalink,
      // La huella de hoy: el aviso no se reenvía hasta que cambie algo del emprendimiento.
      contentHash: contentFingerprint({
        kind: 'development',
        listingId,
        source,
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
      listing = Listing.linked({ id: listingId, portal, owner, operation: undefined, ...adopted });
    }

    const { linkedUnits } = taken.value;
    return this.deps.uow.run(
      async (
        tx,
      ): Promise<
        Result<
          { readonly listingId: string; readonly linkedUnits: number },
          LinkDevelopmentListingError
        >
      > => {
        await tx.listings.save(listing, actor.id);
        await tx.events.publish(listing.pullEvents());
        await tx.audit.record(
          auditAction(actor, listingAuditTarget('portal_listing_linked', listing), {
            [`listings.${listing.id}`]: {
              before: null,
              after: { ...listingAuditValue(listing), remoteId, linkedUnits },
            },
          }),
        );
        return ok({ listingId: listing.id, linkedUnits });
      },
    );
  }
}
