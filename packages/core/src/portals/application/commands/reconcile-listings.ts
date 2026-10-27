import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { PortalInputSchema, type PortalInput } from '../../contracts';
import type { ListingId } from '../../domain/listing';
import { PORTAL_CATALOG } from '../../domain/portal';
import { applyRemoteState, retryFailedListings, SYNC_UNAVAILABLE } from '../listing-support';
import type { PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalCredentialsMissingError } from '../ports/portal-connector';
import type { PortalListingStateReader } from '../ports/portal-listing-states';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type ReconcileListingsError =
  ForbiddenError | ValidationFailedError | PortalUnavailableError | PortalCredentialsMissingError;

/**
 * Cómo terminó: cuántos avisos se leyeron del portal, cuántas publicaciones cambiaron y cuántas se
 * volvieron a sincronizar porque el portal no había respondido.
 */
export interface ReconcileListingsOutcome {
  readonly checked: number;
  readonly changed: number;
  readonly retried: number;
}

/** Publicaciones por tanda: se leen de la base y se consultan al portal juntas. */
const BATCH_SIZE = 50;
/** Tope de tandas por corrida: diez mil avisos vivos en un portal no son de una inmobiliaria. */
const MAX_BATCHES = 200;

const NOTHING: ReconcileListingsOutcome = { checked: 0, changed: 0, retried: 0 };

/**
 * La conciliación diaria: lee del portal cómo están los avisos publicados y refleja en cada
 * publicación lo que pasó allá sin que Norde lo pidiera (vencido, cerrado, pausado por moderación).
 * También vuelve a pedir la sincronización de las que quedaron en error porque el portal no
 * respondió (los reintentos del job se agotaron durante la caída), aunque el portal no se concilie.
 * Recorre las publicaciones por lotes, y cada cambio se guarda con la publicación bloqueada, para
 * no pisar una sincronización que corre a la vez. Se audita por quien la corre (`system:portal-sync`).
 */
export class ReconcileListings {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly reader: PortalListingStateReader;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: PortalInput,
    actor: Actor,
  ): Promise<Result<ReconcileListingsOutcome, ReconcileListingsError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PortalInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal } = parsed.value;
    const { reconciles } = PORTAL_CATALOG[portal];

    const account = await this.deps.uow.run((tx) => tx.accounts.get(portal));
    // Sin cuenta conectada no hay a quién preguntarle: no es un error del job.
    if (!account.toSnapshot().connection) return ok(NOTHING);

    let after: ListingId | undefined;
    let checked = 0;
    let changed = 0;
    let retried = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const listings = await this.deps.uow.run((tx) =>
        tx.listings.findLiveOnPortal(portal, { after, limit: BATCH_SIZE }),
      );
      const failed = listings.filter((l) => l.toSnapshot().status === 'error').map((l) => l.id);
      retried += await retryFailedListings(this.deps, failed, [SYNC_UNAVAILABLE]);
      const remote = listings.flatMap((l) => {
        const { externalId } = l.toSnapshot();
        return externalId === undefined ? [] : [{ id: l.id, externalId }];
      });
      if (reconciles && remote.length > 0) {
        const states = await this.deps.reader.states(
          portal,
          remote.map((r) => r.externalId),
        );
        if (states.isErr()) return err(states.error);
        for (const { id, externalId } of remote) {
          const state = states.value.get(externalId);
          if (state === undefined) continue;
          checked += 1;
          if (await applyRemoteState(this.deps, id, state, actor)) changed += 1;
        }
      }
      const last = listings.at(-1);
      if (last === undefined || listings.length < BATCH_SIZE) break;
      after = last.id;
    }
    return ok({ checked, changed, retried });
  }
}
