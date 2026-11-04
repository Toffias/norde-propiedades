import type { CompanySettingsReader, Mailer, MailerError } from '../../../settings';
import {
  auditCreated,
  Email,
  err,
  nextId,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type InvalidEmailError,
  type Result,
} from '../../../shared';
import {
  RequestSearchSubscriptionInputSchema,
  type RequestSearchSubscriptionInput,
  type RequestSearchSubscriptionOutput,
} from '../../contracts';
import { firstNameOf } from '../../domain/quick-reply';
import type { InvalidSavedSearchError } from '../../domain/saved-search';
import {
  MAX_PENDING_SUBSCRIPTIONS_PER_EMAIL,
  SearchSubscription,
} from '../../domain/search-subscription';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { SubscriptionConfirmationEmails } from '../ports/search-subscription-ports';
import type { SharedListingTokens } from '../ports/shared-listing-ports';
import { frequencyLabel, searchSubscriptionAuditState } from '../search-subscription-support';

import type { SendingNotConfiguredError } from './send-listings';

/** Lo que puede hacer el sitio público con las suscripciones (`system:web`). */
export const SUBSCRIBE_PERMISSION = 'clients:subscribe-searches';

const DAY_MS = 24 * 60 * 60 * 1000;

export type RequestSearchSubscriptionError =
  | ForbiddenError
  | InvalidInputError
  | InvalidEmailError
  | InvalidSavedSearchError
  | SendingNotConfiguredError
  | MailerError;

/** El link de confirmación que va en el email: una página del sitio con un botón. */
export function searchSubscriptionConfirmUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/suscripcion/${token}`;
}

/**
 * Alguien pide desde el buscador de la web recibir las propiedades que coincidan con su búsqueda
 * (#208). Queda pendiente y se le manda un email para confirmar que la casilla es suya (doble
 * confirmación): hasta que no confirma, no hay contacto ni búsqueda.
 *
 * Un mismo email puede pedir {@link MAX_PENDING_SUBSCRIPTIONS_PER_EMAIL} por día: pasado el tope
 * responde igual pero no manda nada, así nadie llena de mails la casilla de otro. Si el email no
 * sale, no queda nada guardado.
 */
export class RequestSearchSubscription {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly tokens: SharedListingTokens;
      readonly emails: SubscriptionConfirmationEmails;
      readonly mailer: Mailer;
      readonly settings: CompanySettingsReader;
      /** URL del sitio público. Sin ella, no se puede armar el link. */
      readonly siteUrl: string | undefined;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RequestSearchSubscriptionInput,
    actor: Actor,
  ): Promise<Result<RequestSearchSubscriptionOutput, RequestSearchSubscriptionError>> {
    if (!actor.can(SUBSCRIBE_PERMISSION)) return err({ type: 'Forbidden' });
    const parsed = RequestSearchSubscriptionInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const email = Email.create(parsed.data.email);
    if (email.isErr()) return err(email.error);
    const { siteUrl } = this.deps;
    if (siteUrl === undefined) return err({ type: 'SendingNotConfigured' });
    const data = parsed.data;
    const now = this.deps.clock.now();
    const company = (await this.deps.settings.get()).toSnapshot();

    return this.deps.uow.run(
      async (
        tx,
      ): Promise<Result<RequestSearchSubscriptionOutput, RequestSearchSubscriptionError>> => {
        const recent = await tx.searchSubscriptions.countRequestedSince(
          email.value,
          new Date(now.getTime() - DAY_MS),
        );
        if (recent >= MAX_PENDING_SUBSCRIPTIONS_PER_EMAIL) return ok({ requested: true });

        const { token, hash } = this.deps.tokens.issue();
        const requested = SearchSubscription.request({
          id: nextId<'SearchSubscription'>(this.deps.ids),
          tokenHash: hash,
          name: data.name,
          email: email.value,
          criteria: {
            operation: data.operation,
            propertyTypes: data.propertyTypes,
            currency: data.currency,
            minPriceCents: data.minPrice,
            maxPriceCents: data.maxPrice,
            locationIds: data.locationIds,
            minRooms: data.minRooms,
          },
          summary: data.summary,
          frequency: data.frequency,
          now,
        });
        if (requested.isErr()) return err(requested.error);
        const subscription = requested.value;

        await tx.searchSubscriptions.save(subscription, actor.id);
        // Sin nombre ni email: todavía no es un contacto y no se podría suprimir con él.
        await tx.audit.record(
          auditCreated(
            actor,
            {
              action: 'search_subscription.requested',
              entityType: 'search_subscription',
              entityId: subscription.id,
              clientIds: [],
            },
            {
              ...searchSubscriptionAuditState(subscription),
              expiresAt: toAuditValue(subscription.expiresAt),
            },
          ),
        );

        // Dentro de la transacción: si el email no sale, la suscripción no queda guardada.
        const composed = this.deps.emails.compose({
          companyName: company.name,
          firstName: firstNameOf(data.name),
          searchSummary: subscription.summary,
          frequencyLabel: frequencyLabel(subscription.frequency),
          confirmUrl: searchSubscriptionConfirmUrl(siteUrl, token),
          expiresAt: subscription.expiresAt,
        });
        const mailed = await this.deps.mailer.send({
          to: email.value.value,
          ...composed,
          fromName: company.emailSender.fromName ?? company.name,
          replyTo: company.emailSender.replyTo?.value,
        });
        if (mailed.isErr()) return err(mailed.error);
        return ok({ requested: true });
      },
    );
  }
}
