import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListRemoteListingsInputSchema,
  type ListRemoteListingsInput,
  type RemoteListingView,
} from '../../contracts';
import { PORTAL_CATALOG } from '../../domain/portal';
import type { PortalNotConnectedError } from '../../domain/portal-account';
import type { PortalNotConfiguredError, PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalListingCatalog, PropertyCodeLookup } from '../ports/portal-listing-catalog';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type ListRemoteListingsError =
  | ForbiddenError
  | ValidationFailedError
  | PortalNotConnectedError
  | PortalNotConfiguredError
  | PortalUnavailableError;

/**
 * Los avisos que la cuenta tiene online en el portal, de a una página, con la propiedad que les
 * corresponde por código de referencia (la clave interna o el código del aviso) y si ya están
 * vinculados. Para vincular los que publicó Tokko sin republicarlos. Lo ve quien conecta las cuentas.
 */
export class ListRemoteListings {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly catalog: PortalListingCatalog;
      readonly properties: PropertyCodeLookup;
    },
  ) {}

  async execute(
    input: ListRemoteListingsInput,
    actor: Actor,
  ): Promise<Result<Page<RemoteListingView>, ListRemoteListingsError>> {
    if (!actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListRemoteListingsInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal, page, pageSize } = parsed.value;
    if (!PORTAL_CATALOG[portal].linksExisting) {
      return err({
        type: 'ValidationFailed',
        issues: ['Este portal no vincula avisos existentes.'],
      });
    }

    const account = await this.deps.uow.run((tx) => tx.accounts.get(portal));
    const connection = account.toSnapshot().connection;
    if (!connection) return err({ type: 'PortalNotConnected' });

    const slice = await this.deps.catalog.online({
      portal,
      externalAccountId: connection.externalAccountId,
      ...toOffsetLimit({ page, pageSize }),
    });
    if (slice.isErr()) return err(slice.error);
    const remote = slice.value.items;

    const codes = remote.flatMap((r) => [r.reference, r.code]).filter((c) => c !== undefined);
    const [properties, linked] = await Promise.all([
      this.deps.properties.byCodes(codes),
      this.deps.uow.run((tx) =>
        tx.listings.findByExternalIds(
          portal,
          remote.flatMap((r) => (r.code === undefined ? [] : [r.code])),
        ),
      ),
    ]);
    const byCode = new Map(properties.map((p) => [p.code, p]));
    const byExternalId = new Map(linked.map((l) => [l.toSnapshot().externalId, l]));

    const items = remote.map((r): RemoteListingView => {
      const property = [r.reference, r.code]
        .map((code) => (code === undefined ? undefined : byCode.get(code)))
        .find((p) => p !== undefined);
      const listing = r.code === undefined ? undefined : byExternalId.get(r.code);
      return {
        remoteId: r.remoteId,
        title: r.title,
        reference: r.reference,
        plan: r.plan,
        location: r.location,
        permalink: r.permalink,
        isDevelopment: r.isDevelopment,
        match: property && {
          propertyId: property.propertyId,
          code: property.code,
          title: property.title,
        },
        linked: listing && { listingId: listing.id, owner: listing.owner },
      };
    });
    return ok(toPage({ items, total: slice.value.total }, { page, pageSize }));
  }
}
