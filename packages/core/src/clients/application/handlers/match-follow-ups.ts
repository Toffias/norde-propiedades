import {
  auditAction,
  err,
  nextId,
  ok,
  parseId,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { FollowUpListingProfile } from '../../contracts';
import {
  followUpPrice,
  isPriceDrop,
  type FollowUpMatch,
  type FollowUpPrice,
  type FollowUpReason,
  type FollowUpSource,
} from '../../domain/follow-up-match';
import { clientTarget } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { FollowUpCandidatesQuery, FollowUpListings } from '../ports/follow-up-ports';

/** De a cuántos candidatos se cruza: cada página es una transacción. */
const PAGE_SIZE = 200;

/** Lo que pasó con la propiedad, ya leído del evento. */
export type FollowUpTrigger =
  /** Se guardó (alta, edición, cambio de estado o de publicación): puede haber empezado a ofrecerse. */
  | { readonly kind: 'listing_changed' }
  | {
      readonly kind: 'price_changed';
      readonly operation: string;
      readonly oldPriceCents: bigint | undefined;
      readonly newPriceCents: bigint | undefined;
    };

export interface MatchFollowUpsInput {
  readonly propertyId: string;
  readonly trigger: FollowUpTrigger;
}

/** Cuántas coincidencias nuevas quedaron para mandar. */
export interface MatchFollowUpsOutcome {
  readonly matched: number;
}

interface Candidate {
  readonly clientId: string;
  readonly source: FollowUpSource;
  readonly price: FollowUpPrice;
}

/** Una página de la consulta: cuántas filas trajo (para saber si hay más) y las que sirven. */
interface CandidatePage {
  readonly rows: number;
  readonly candidates: readonly Candidate[];
}

function pageOf<T>(
  rows: readonly T[],
  toCandidate: (row: T) => Candidate | undefined,
): CandidatePage {
  return {
    rows: rows.length,
    candidates: rows.flatMap((row) => toCandidate(row) ?? []),
  };
}

/**
 * El cruce de una propiedad con los seguimientos automáticos (#106). Solo cuenta si el sitio la
 * muestra (el envío lleva un link que el cliente tiene que poder abrir):
 * - **Nueva**: coincide con una búsqueda con envío automático guardada antes de que empezara a
 *   ofrecerse.
 * - **Baja de precio**: coincide con una búsqueda con envío automático de esa operación, o es una
 *   destacada con auto-envío de novedades.
 *
 * Es idempotente: la misma propiedad no queda dos veces como nueva para un cliente, ni la misma
 * baja dos veces. Cada coincidencia queda en el historial del contacto como cambio del sistema.
 */
export class MatchFollowUps {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly listings: FollowUpListings;
      readonly candidates: FollowUpCandidatesQuery;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: MatchFollowUpsInput,
    actor: Actor,
  ): Promise<Result<MatchFollowUpsOutcome, ForbiddenError>> {
    // Solo el sistema: corre por los eventos de properties.
    if (actor.kind !== 'system' || !actor.can('clients:match-follow-ups')) {
      return err({ type: 'Forbidden' });
    }
    const propertyId = parseId<'Property'>(input.propertyId);
    if (propertyId.isErr()) return ok({ matched: 0 });
    const profile = await this.deps.listings.find(propertyId.value);
    if (!profile?.listed) return ok({ matched: 0 });

    const { trigger } = input;
    if (trigger.kind === 'listing_changed') {
      if (profile.listedSince === undefined) return ok({ matched: 0 });
      const listedSince = profile.listedSince;
      return ok({
        matched: await this.matchPages('new_listing', profile, actor, async (offset) => {
          const rows = await this.deps.candidates.searches({
            profile,
            operation: undefined,
            savedUntil: listedSince,
            offset,
            limit: PAGE_SIZE,
          });
          return pageOf(rows, (search) => {
            const price = followUpPrice(profile.operations, search.operation);
            const source = savedSearchSource(search.savedSearchId);
            return price === undefined || source === undefined
              ? undefined
              : { clientId: search.clientId, source, price };
          });
        }),
      });
    }

    if (!isPriceDrop(trigger.oldPriceCents, trigger.newPriceCents)) return ok({ matched: 0 });
    const price = followUpPrice(profile.operations, trigger.operation);
    // Un evento viejo (ya cambió otra vez) o el precio pasó a "a consultar": no se avisa.
    if (price?.priceCents === undefined || price.priceCents !== trigger.newPriceCents) {
      return ok({ matched: 0 });
    }
    const fromSearches = await this.matchPages('price_drop', profile, actor, async (offset) => {
      const rows = await this.deps.candidates.searches({
        profile,
        operation: trigger.operation,
        savedUntil: undefined,
        offset,
        limit: PAGE_SIZE,
      });
      return pageOf(rows, (search) => {
        const source = savedSearchSource(search.savedSearchId);
        return source === undefined ? undefined : { clientId: search.clientId, source, price };
      });
    });
    const fromFeatured = await this.matchPages('price_drop', profile, actor, async (offset) => {
      const rows = await this.deps.candidates.featured({
        propertyId: profile.propertyId,
        offset,
        limit: PAGE_SIZE,
      });
      return pageOf(rows, (featured) => {
        const source = featuredSource(featured.featuredListingId);
        return source === undefined ? undefined : { clientId: featured.clientId, source, price };
      });
    });
    return ok({ matched: fromSearches + fromFeatured });
  }

  /** Recorre los candidatos de a páginas y guarda las coincidencias nuevas de cada una. */
  private async matchPages(
    reason: FollowUpReason,
    profile: FollowUpListingProfile,
    actor: Actor,
    page: (offset: number) => Promise<CandidatePage>,
  ): Promise<number> {
    let matched = 0;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { rows, candidates } = await page(offset);
      if (candidates.length > 0) {
        matched += await this.save(reason, profile, candidates, actor);
      }
      if (rows < PAGE_SIZE) return matched;
    }
  }

  private save(
    reason: FollowUpReason,
    profile: FollowUpListingProfile,
    candidates: readonly Candidate[],
    actor: Actor,
  ): Promise<number> {
    const now = this.deps.clock.now();
    return this.deps.uow.run(async (tx) => {
      let added = 0;
      for (const candidate of candidates) {
        const clientId = parseId<'Client'>(candidate.clientId);
        if (clientId.isErr()) continue;
        const match: FollowUpMatch = {
          id: nextId<'FollowUpMatch'>(this.deps.ids),
          clientId: clientId.value,
          propertyId: profile.propertyId,
          reason,
          source: candidate.source,
          price: candidate.price,
          detectedAt: now,
        };
        if (!(await tx.followUpMatches.add(match, actor.id))) continue;
        added += 1;
        await tx.audit.record(
          auditAction(actor, clientTarget('client.follow_up_matched', clientId.value), {
            followUpMatchId: { before: null, after: match.id },
            propertyId: { before: null, after: match.propertyId },
            reason: { before: null, after: reason },
            ...(match.source.kind === 'saved_search'
              ? { savedSearchId: { before: null, after: match.source.savedSearchId } }
              : { featuredListingId: { before: null, after: match.source.featuredListingId } }),
            price: { before: null, after: toAuditValue(match.price) },
          }),
        );
      }
      return added;
    });
  }
}

function savedSearchSource(id: string): FollowUpSource | undefined {
  const parsed = parseId<'SavedSearch'>(id);
  return parsed.isOk() ? { kind: 'saved_search', savedSearchId: parsed.value } : undefined;
}

function featuredSource(id: string): FollowUpSource | undefined {
  const parsed = parseId<'FeaturedListing'>(id);
  return parsed.isOk() ? { kind: 'featured', featuredListingId: parsed.value } : undefined;
}
