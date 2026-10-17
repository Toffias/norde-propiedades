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
  ListRemoteDevelopmentsInputSchema,
  type ListRemoteDevelopmentsInput,
  type RemoteDevelopmentView,
} from '../../contracts';
import { PORTAL_CATALOG, portalPublishes } from '../../domain/portal';
import type { PortalNotConnectedError } from '../../domain/portal-account';
import type { PortalNotConfiguredError, PortalUnavailableError } from '../ports/portal-authorizer';
import type { DevelopmentCodeLookup, PortalListingCatalog } from '../ports/portal-listing-catalog';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type ListRemoteDevelopmentsError =
  | ForbiddenError
  | ValidationFailedError
  | PortalNotConnectedError
  | PortalNotConfiguredError
  | PortalUnavailableError;

/**
 * Los emprendimientos que la cuenta tiene online en el portal, de a una página, con el emprendimiento
 * de Norde que les corresponde por código (la clave interna o el código del aviso) y si ya están
 * vinculados. Para vincular los que publicó Tokko sin republicarlos. Lo ve quien conecta las cuentas.
 */
export class ListRemoteDevelopments {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly catalog: PortalListingCatalog;
      readonly developments: DevelopmentCodeLookup;
    },
  ) {}

  async execute(
    input: ListRemoteDevelopmentsInput,
    actor: Actor,
  ): Promise<Result<Page<RemoteDevelopmentView>, ListRemoteDevelopmentsError>> {
    if (!actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListRemoteDevelopmentsInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal, page, pageSize } = parsed.value;
    if (!PORTAL_CATALOG[portal].linksExisting || !portalPublishes(portal, 'development')) {
      return err({
        type: 'ValidationFailed',
        issues: ['Este portal no vincula emprendimientos existentes.'],
      });
    }

    const account = await this.deps.uow.run((tx) => tx.accounts.get(portal));
    const connection = account.toSnapshot().connection;
    if (!connection) return err({ type: 'PortalNotConnected' });

    const slice = await this.deps.catalog.onlineDevelopments({
      portal,
      externalAccountId: connection.externalAccountId,
      ...toOffsetLimit({ page, pageSize }),
    });
    if (slice.isErr()) return err(slice.error);
    const remote = slice.value.items;

    const codes = remote.flatMap((r) => [r.reference, r.code]).filter((c) => c !== undefined);
    const [developments, linked] = await Promise.all([
      this.deps.developments.byCodes(codes),
      this.deps.uow.run((tx) =>
        tx.listings.findByExternalIds(
          portal,
          remote.flatMap((r) => (r.code === undefined ? [] : [r.code])),
        ),
      ),
    ]);
    const byCode = new Map(developments.map((d) => [d.code, d]));
    const byExternalId = new Map(linked.map((l) => [l.toSnapshot().externalId, l]));

    const items = remote.map((r): RemoteDevelopmentView => {
      const development = [r.reference, r.code]
        .map((code) => (code === undefined ? undefined : byCode.get(code)))
        .find((d) => d !== undefined);
      const listing = r.code === undefined ? undefined : byExternalId.get(r.code);
      return {
        remoteId: r.remoteId,
        title: r.title,
        reference: r.reference,
        plan: r.plan,
        location: r.location,
        permalink: r.permalink,
        unitCount: r.units.length,
        match: development && {
          developmentId: development.developmentId,
          code: development.code,
          name: development.name,
        },
        linked:
          listing?.owner.kind === 'development'
            ? { listingId: listing.id, developmentId: listing.owner.id }
            : undefined,
      };
    });
    return ok(toPage({ items, total: slice.value.total }, { page, pageSize }));
  }
}
