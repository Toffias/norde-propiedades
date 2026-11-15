import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { RequestReservedCoversInputSchema, type RequestReservedCoversInput } from '../../contracts';
import type { MediaItem, MediaItemId } from '../../domain/media-item';
import { idOf } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type RequestReservedCoversError = ForbiddenError | InvalidInputError;

/** Portadas por transacción al recorrerlas todas. */
const BATCH_SIZE = 100;

/**
 * Pide la portada "Reservado" (cada una la genera el job de `ReservedCoverRequested`):
 * - De una propiedad que pasó a reservada, si a su portada le falta (las de antes de esta función,
 *   o una que falló): reservar no espera a que alguien la haya generado.
 * - De todas las propiedades, cuando cambia el banner en Mi empresa. Las recorre de a lotes.
 *
 * Devuelve cuántas pidió.
 */
export class RequestReservedCovers {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RequestReservedCoversInput,
    actor: Actor,
  ): Promise<Result<number, RequestReservedCoversError>> {
    if (!actor.can('properties:process-media')) return err({ type: 'Forbidden' });
    const parsed = RequestReservedCoversInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const request = parsed.data;
    if ('propertyId' in request) return ok(await this.requestMissing(request.propertyId));
    return ok(await this.requestAll());
  }

  private requestMissing(propertyId: string): Promise<number> {
    const id = idOf<'Property'>(propertyId);
    if (id === undefined) return Promise.resolve(0);
    return this.deps.uow.run(async (tx) => {
      const gallery = await tx.media.listForOwner({ kind: 'property', id });
      const cover = gallery.find((item) => item.isCover);
      if (!cover || cover.toSnapshot().variants.reserved !== undefined) return 0;
      return this.request([cover], (events) => tx.events.publish(events));
    });
  }

  private async requestAll(): Promise<number> {
    let after: MediaItemId | undefined;
    let total = 0;
    for (;;) {
      const batch = await this.deps.uow.run(async (tx) => {
        const covers = await tx.media.listPropertyCovers(after, BATCH_SIZE);
        const requested = await this.request(covers, (events) => tx.events.publish(events));
        return { covers, requested };
      });
      total += batch.requested;
      const last = batch.covers.at(-1);
      if (batch.covers.length < BATCH_SIZE || !last) return total;
      after = last.id;
    }
  }

  private async request(
    covers: readonly MediaItem[],
    publish: (events: ReturnType<MediaItem['pullEvents']>) => Promise<void>,
  ): Promise<number> {
    const now = this.deps.clock.now();
    let requested = 0;
    for (const cover of covers) {
      if (!cover.requestReservedCover(now)) continue;
      await publish(cover.pullEvents());
      requested += 1;
    }
    return requested;
  }
}
