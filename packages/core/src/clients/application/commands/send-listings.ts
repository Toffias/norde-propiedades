import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import type { CompanySettingsReader, Mailer, MailerError } from '../../../settings';
import {
  auditAction,
  err,
  nextId,
  ok,
  Phone,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  SendListingsInputSchema,
  type SendListingsInput,
  type SendListingsOutput,
} from '../../contracts';
import type { Client, ClientInTrashError } from '../../domain/client';
import { listingSentActivity } from '../../domain/client-activity';
import { latestOpenOpportunity } from '../../domain/opportunity';
import {
  SharedListing,
  sharedListingUrl,
  whatsappMessageUrl,
  type NoListingsToSendError,
  type TooManyListingsError,
} from '../../domain/shared-listing';
import {
  clientTarget,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { AgentNames } from '../ports/property-interest-query';
import type { ClientListings } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type {
  PublicListings,
  SharedListingEmails,
  SharedListingTokens,
} from '../ports/shared-listing-ports';
import type { ListingNotFoundError } from './feature-properties';

/** Falta la URL del sitio público en el entorno: no hay a dónde mandar el link. */
export interface SendingNotConfiguredError {
  readonly type: 'SendingNotConfigured';
}

/** El contacto no tiene un email (o un teléfono) al que mandarlo. */
export interface NoRecipientError {
  readonly type: 'NoRecipient';
  readonly channel: 'email' | 'whatsapp';
}

/** Alguna propiedad no se ve en el sitio: el cliente no la podría abrir. */
export interface ListingNotPublicError {
  readonly type: 'ListingNotPublic';
  readonly codes: readonly string[];
}

export type SendListingsError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | ListingNotFoundError
  | ListingNotPublicError
  | NoListingsToSendError
  | TooManyListingsError
  | NoRecipientError
  | SendingNotConfiguredError
  | MailerError;

const DEFAULT_WHATSAPP_MESSAGE = '¡Hola! Te comparto unas propiedades que pueden interesarte:';

/**
 * Le manda propiedades a un contacto por email (con la plantilla de Norde) o por WhatsApp (un
 * link `wa.me` que abre el WhatsApp del asesor con el mensaje escrito; no pasa por el agente de
 * IA). Cada envío es un link público que vence y registra aperturas y reacciones. Queda en la
 * actividad del contacto, atado a su oportunidad abierta (regla "tras enviar"), y en su historial.
 * Si el email no sale, no queda nada.
 */
export class SendListings {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly listings: ClientListings;
      readonly publicListings: PublicListings;
      readonly tokens: SharedListingTokens;
      readonly emails: SharedListingEmails;
      readonly mailer: Mailer;
      readonly settings: CompanySettingsReader;
      readonly agents: AgentNames;
      /** URL del sitio público (`https://norde.com.ar`). Sin ella, no se envía. */
      readonly siteUrl: string | undefined;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: SendListingsInput,
    actor: Actor,
  ): Promise<Result<SendListingsOutput, SendListingsError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = SendListingsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { siteUrl } = this.deps;
    if (siteUrl === undefined) return err({ type: 'SendingNotConfigured' });
    const { channel, message } = parsed.data;
    const requested = [...new Set(parsed.data.propertyIds.map((id) => id.toLowerCase()))];

    // Las propiedades son de otro módulo: se leen por su API pública, fuera de la transacción.
    const listings = await this.deps.listings.summaries(requested, actor);
    if (requested.some((id) => !listings.has(id))) return err({ type: 'ListingNotFound' });
    const unlisted = await this.deps.publicListings.unlisted(requested);
    if (unlisted.length > 0) {
      return err({
        type: 'ListingNotPublic',
        codes: unlisted.map((id) => listings.get(id)?.code ?? id),
      });
    }

    const now = this.deps.clock.now();
    const { token, hash } = this.deps.tokens.issue();
    const url = sharedListingUrl(siteUrl, token);

    return this.deps.uow.run(async (tx): Promise<Result<SendListingsOutput, SendListingsError>> => {
      const client = await findClient(tx.clients, parsed.data.clientId);
      if (!client) return err({ type: 'ClientNotFound' });
      if (!canActOn(actor, rule, client.ownership)) return err({ type: 'Forbidden' });
      if (client.isDeleted) return err({ type: 'ClientInTrash' });
      const recipient = recipientOf(client, channel, parsed.data.recipient);
      if (recipient === undefined) return err({ type: 'NoRecipient', channel });

      const opportunity = latestOpenOpportunity(await tx.opportunities.findOpenByClient(client.id));
      const sent = SharedListing.send({
        id: nextId<'SharedListing'>(this.deps.ids),
        tokenHash: hash,
        clientId: client.id,
        opportunityId: opportunity?.id,
        channel,
        propertyIds: requested,
        by: actor.id,
        now,
      });
      if (sent.isErr()) return err(sent.error);
      const listing = sent.value;
      await tx.sharedListings.save(listing, actor.id);
      await tx.activities.add(
        listingSentActivity({
          id: this.deps.ids.next(),
          clientId: client.id,
          opportunityId: opportunity?.id,
          channel,
          propertyIds: listing.propertyIds,
          actorId: actor.id,
          now,
        }),
        actor.id,
      );
      await tx.events.publish(listing.pullEvents());
      // El destinatario es un dato personal: queda que se envió, por dónde y qué.
      await tx.audit.record(
        auditAction(actor, clientTarget('client.listings_sent', client.id), {
          sharedListingId: { before: null, after: listing.id },
          channel: { before: null, after: channel },
          propertyIds: { before: null, after: toAuditValue(listing.propertyIds) },
          ...(opportunity ? { opportunityId: { before: null, after: opportunity.id } } : {}),
        }),
      );

      if (recipient.kind === 'whatsapp') {
        const text = `${message ?? DEFAULT_WHATSAPP_MESSAGE}\n\n${url}`;
        return ok({
          sharedListingId: listing.id,
          url,
          whatsappUrl: whatsappMessageUrl(recipient.phone, text),
        });
      }

      // Dentro de la transacción: si el email no sale, el envío no queda registrado.
      const company = (await this.deps.settings.get()).toSnapshot();
      const advisorName = (await this.deps.agents.names([actor.id])).get(actor.id);
      const email = this.deps.emails.compose({
        companyName: company.name,
        advisorName,
        message,
        url,
        expiresAt: listing.toSnapshot().expiresAt,
        listings: requested.flatMap((id) => listings.get(id) ?? []),
      });
      const mailed = await this.deps.mailer.send({
        to: recipient.email,
        ...email,
        fromName: company.emailSender.fromName ?? company.name,
        replyTo: company.emailSender.replyTo?.value,
      });
      if (mailed.isErr()) return err(mailed.error);
      return ok({ sharedListingId: listing.id, url, whatsappUrl: undefined });
    });
  }
}

type Recipient =
  | { readonly kind: 'email'; readonly email: string }
  | { readonly kind: 'whatsapp'; readonly phone: Phone };

/** El email o teléfono elegido, si es del contacto; sin elegir, el primero que tenga. */
function recipientOf(
  client: Client,
  channel: 'email' | 'whatsapp',
  chosen: string | undefined,
): Recipient | undefined {
  if (channel === 'email') {
    const email =
      chosen === undefined
        ? client.email
        : client.emails.find((e) => e.email.value === chosen.trim().toLowerCase())?.email;
    return email === undefined ? undefined : { kind: 'email', email: email.value };
  }
  if (chosen === undefined) {
    return client.phone === undefined ? undefined : { kind: 'whatsapp', phone: client.phone };
  }
  const wanted = Phone.create(chosen);
  if (wanted.isErr()) return undefined;
  const phone = client.phones.find((p) => p.phone.sameContactAs(wanted.value))?.phone;
  return phone === undefined ? undefined : { kind: 'whatsapp', phone };
}
