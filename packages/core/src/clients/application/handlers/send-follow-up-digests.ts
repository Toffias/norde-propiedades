import type { CompanySettingsReader, Mailer, MailerError } from '../../../settings';
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
import type { ClientListingSummary } from '../../contracts';
import type { ClientId } from '../../domain/client';
import { listingSentActivity } from '../../domain/client-activity';
import type { FeaturedListingId } from '../../domain/featured-listing';
import {
  followUpDigestText,
  pickFollowUpDigest,
  type FollowUpMatch,
} from '../../domain/follow-up-match';
import { firstNameOf } from '../../domain/quick-reply';
import { MAX_SAVED_SEARCHES_PER_CLIENT } from '../../domain/saved-search';
import {
  followUpUnsubscribeUrl,
  MAX_SHARED_PROPERTIES,
  SharedListing,
  sharedListingUrl,
  type NoListingsToSendError,
  type TooManyListingsError,
} from '../../domain/shared-listing';
import { clientTarget, findClient } from '../client-support';
import type { SendingNotConfiguredError } from '../commands/send-listings';
import type { ClientListings } from '../ports/client-record-query';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';
import type { PendingFollowUpsQuery } from '../ports/follow-up-ports';
import type { AgentNames } from '../ports/property-interest-query';
import type {
  PublicListings,
  SharedListingEmails,
  SharedListingTokens,
} from '../ports/shared-listing-ports';

/** De a cuántos contactos se recorren los pendientes. */
const CLIENTS_PAGE_SIZE = 100;

/** Cuántas coincidencias pendientes de un contacto se miran por día: alcanza para un envío. */
const PENDING_PER_CLIENT = 100;

/** Por qué no salió el resumen de un contacto: no frena a los demás y se reintenta mañana. */
export type FollowUpDigestError = NoListingsToSendError | TooManyListingsError | MailerError;

export interface FollowUpDigestFailure {
  readonly clientId: string;
  readonly error: FollowUpDigestError;
}

/**
 * Cuántos contactos recibieron su resumen, a cuántos solo se les descartaron coincidencias que ya
 * no correspondían, y a cuáles no les salió (para loguearlo en el borde).
 */
export interface SendFollowUpDigestsOutcome {
  readonly sent: number;
  readonly discarded: number;
  readonly failures: readonly FollowUpDigestFailure[];
}

type ClientOutcome = 'sent' | 'discarded' | 'nothing';

/** Lo que se mira antes de mandar, fuera de la transacción del envío. */
interface Review {
  readonly clientId: ClientId;
  readonly email: string | undefined;
  readonly name: string | undefined;
  readonly agentId: string | undefined;
  readonly live: readonly FollowUpMatch[];
  readonly stale: readonly FollowUpMatch[];
}

/**
 * El resumen diario de los seguimientos automáticos (#106): un solo email por contacto con lo que
 * el cruce con el stock encontró desde el último. Cada resumen es un envío como los del asesor
 * (link público que vence, aperturas y reacciones) con el link para darse de baja.
 *
 * Antes de mandar, descarta lo que ya no corresponde: el contacto se dio de baja o se apagó el
 * envío automático, la propiedad dejó de verse en el sitio, el contacto está en la papelera o no
 * tiene email. Si el email no sale, el contacto queda como estaba y se reintenta al día siguiente.
 * El envío no se ata a una oportunidad: no es el asesor el que contacta.
 */
export class SendFollowUpDigests {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly pending: PendingFollowUpsQuery;
      readonly listings: ClientListings;
      readonly publicListings: PublicListings;
      readonly tokens: SharedListingTokens;
      readonly emails: SharedListingEmails;
      readonly mailer: Mailer;
      readonly settings: CompanySettingsReader;
      readonly agents: AgentNames;
      /** URL del sitio público. Sin ella, no se envía. */
      readonly siteUrl: string | undefined;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    actor: Actor,
  ): Promise<Result<SendFollowUpDigestsOutcome, ForbiddenError | SendingNotConfiguredError>> {
    // Solo el sistema: corre una vez por día.
    if (actor.kind !== 'system' || !actor.can('clients:send-follow-ups')) {
      return err({ type: 'Forbidden' });
    }
    const { siteUrl } = this.deps;
    if (siteUrl === undefined) return err({ type: 'SendingNotConfigured' });

    const counts = { sent: 0, discarded: 0 };
    const failures: FollowUpDigestFailure[] = [];
    let after: string | undefined;
    for (;;) {
      const clientIds = await this.deps.pending.clients({ after, limit: CLIENTS_PAGE_SIZE });
      for (const id of clientIds) {
        const clientId = parseId<'Client'>(id);
        if (clientId.isErr()) continue;
        const outcome = await this.sendTo(clientId.value, siteUrl, actor);
        if (outcome.isErr()) failures.push({ clientId: clientId.value, error: outcome.error });
        else if (outcome.value !== 'nothing') counts[outcome.value] += 1;
      }
      if (clientIds.length < CLIENTS_PAGE_SIZE) return ok({ ...counts, failures });
      after = clientIds.at(-1);
    }
  }

  private async sendTo(
    clientId: ClientId,
    siteUrl: string,
    actor: Actor,
  ): Promise<Result<ClientOutcome, FollowUpDigestError>> {
    const review = await this.deps.uow.run((tx) => this.review(tx, clientId));

    // Las propiedades son de otro módulo: se leen por su API pública, fuera de la transacción.
    const candidates = [...new Set(review.live.map((match) => match.propertyId))];
    const unlisted = new Set(
      candidates.length === 0 ? [] : await this.deps.publicListings.unlisted(candidates),
    );
    const summaries =
      candidates.length === 0
        ? new Map<string, ClientListingSummary>()
        : await this.deps.listings.summaries(candidates, actor);
    const visible = (match: FollowUpMatch) =>
      !unlisted.has(match.propertyId) && summaries.has(match.propertyId);
    const stale = [...review.stale, ...review.live.filter((match) => !visible(match))];
    const digest = pickFollowUpDigest(review.live.filter(visible), MAX_SHARED_PROPERTIES);
    if (digest.matches.length === 0 && stale.length === 0) return ok('nothing');

    const now = this.deps.clock.now();
    const company = (await this.deps.settings.get()).toSnapshot();
    const advisorName =
      review.agentId === undefined
        ? undefined
        : (await this.deps.agents.names([review.agentId])).get(review.agentId);
    const { token, hash } = this.deps.tokens.issue();

    return this.deps.uow.run(async (tx): Promise<Result<ClientOutcome, FollowUpDigestError>> => {
      if (stale.length > 0) {
        await tx.followUpMatches.discard(
          stale.map((match) => match.id),
          now,
          actor.id,
        );
        await tx.audit.record(
          auditAction(actor, clientTarget('client.follow_ups_discarded', clientId), {
            followUpMatchIds: { before: null, after: toAuditValue(stale.map((m) => m.id)) },
          }),
        );
      }
      if (digest.matches.length === 0 || review.email === undefined) return ok('discarded');

      const sent = SharedListing.send({
        id: nextId<'SharedListing'>(this.deps.ids),
        tokenHash: hash,
        clientId,
        opportunityId: undefined,
        channel: 'email',
        propertyIds: digest.propertyIds,
        by: actor.id,
        now,
      });
      if (sent.isErr()) return err(sent.error);
      const listing = sent.value;
      await tx.sharedListings.save(listing, actor.id);
      await tx.followUpMatches.markSent(
        digest.matches.map((match) => match.id),
        listing.id,
        now,
        actor.id,
      );
      await tx.activities.add(
        listingSentActivity({
          id: this.deps.ids.next(),
          clientId,
          opportunityId: undefined,
          channel: 'email',
          propertyIds: listing.propertyIds,
          actorId: actor.id,
          now,
        }),
        actor.id,
      );
      await tx.events.publish(listing.pullEvents());
      await tx.audit.record(
        auditAction(actor, clientTarget('client.follow_ups_sent', clientId), {
          sharedListingId: { before: null, after: listing.id },
          propertyIds: { before: null, after: toAuditValue(listing.propertyIds) },
          followUpMatchIds: {
            before: null,
            after: toAuditValue(digest.matches.map((match) => match.id)),
          },
        }),
      );

      // Dentro de la transacción: si el email no sale, quedan pendientes para mañana.
      const text = followUpDigestText({
        companyName: company.name,
        firstName: firstNameOf(review.name),
        matches: digest.matches,
      });
      const email = this.deps.emails.compose({
        companyName: company.name,
        advisorName,
        message: text.message,
        subject: text.subject,
        url: sharedListingUrl(siteUrl, token),
        expiresAt: listing.toSnapshot().expiresAt,
        listings: digest.propertyIds.flatMap((id) => summaries.get(id) ?? []),
        unsubscribeUrl: followUpUnsubscribeUrl(siteUrl, token),
      });
      const mailed = await this.deps.mailer.send({
        to: review.email,
        ...email,
        fromName: company.emailSender.fromName ?? company.name,
        replyTo: company.emailSender.replyTo?.value,
      });
      if (mailed.isErr()) return err(mailed.error);
      return ok('sent');
    });
  }

  /** Las pendientes del contacto, separadas en las que todavía corresponden y las que no. */
  private async review(tx: ClientsTransaction, clientId: ClientId): Promise<Review> {
    const pending = await tx.followUpMatches.findPending(clientId, PENDING_PER_CLIENT);
    const client = await findClient(tx.clients, clientId);
    const email = client?.isDeleted === false ? client.email?.value : undefined;
    const base = {
      clientId,
      email,
      name: client?.name,
      agentId: client?.ownership.ownerId,
    };
    if (email === undefined) return { ...base, live: [], stale: pending };

    const searches = await tx.savedSearches.findActiveByClient(
      clientId,
      MAX_SAVED_SEARCHES_PER_CLIENT,
    );
    const sendingSearches = new Set(
      searches.filter((search) => search.sendsAutomatically).map((search) => search.id),
    );
    const featuredIds = pending.flatMap((match) =>
      match.source.kind === 'featured' ? [match.source.featuredListingId] : [],
    );
    const featured =
      featuredIds.length === 0
        ? []
        : await tx.featured.findByIds([...new Set<FeaturedListingId>(featuredIds)]);
    const sendingFeatured = new Set(
      featured
        .filter((listing) => listing.isActive && listing.autoSendUpdates)
        .map((listing) => listing.id),
    );
    const stillWanted = (match: FollowUpMatch) =>
      match.source.kind === 'saved_search'
        ? sendingSearches.has(match.source.savedSearchId)
        : sendingFeatured.has(match.source.featuredListingId);
    return {
      ...base,
      live: pending.filter(stillWanted),
      stale: pending.filter((match) => !stillWanted(match)),
    };
  }
}
