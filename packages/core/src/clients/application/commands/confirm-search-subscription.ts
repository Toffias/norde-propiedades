import {
  auditAction,
  auditCreated,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  SearchSubscriptionTokenInputSchema,
  type SearchSubscriptionTokenInput,
  type SearchSubscriptionView,
} from '../../contracts';
import { Client, type MissingContactInfoError } from '../../domain/client';
import { findExistingClient, unclaimedContact } from '../../domain/duplicate-check';
import {
  checkSavedSearchLimit,
  SavedSearch,
  type InvalidSavedSearchError,
  type SavedSearchLimitReachedError,
} from '../../domain/saved-search';
import type {
  SearchSubscription,
  SearchSubscriptionExpiredError,
} from '../../domain/search-subscription';
import { clientAuditState, clientTarget, findClient } from '../client-support';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';
import type { DefaultAssignee } from '../ports/default-assignee';
import type { SharedListingTokens } from '../ports/shared-listing-ports';
import { savedSearchAuditState } from '../saved-search-support';

import { SUBSCRIBE_PERMISSION } from './request-search-subscription';

export interface SearchSubscriptionNotFoundError {
  readonly type: 'SearchSubscriptionNotFound';
}

export type ConfirmSearchSubscriptionError =
  | ForbiddenError
  | SearchSubscriptionNotFoundError
  | SearchSubscriptionExpiredError
  | SavedSearchLimitReachedError
  | InvalidSavedSearchError
  | MissingContactInfoError;

/** Lo que ve la persona en la página de confirmación. */
export function searchSubscriptionView(
  subscription: SearchSubscription,
  now: Date,
): SearchSubscriptionView {
  return {
    summary: subscription.summary,
    frequency: subscription.frequency,
    status: subscription.isConfirmed
      ? 'confirmed'
      : subscription.isExpired(now)
        ? 'expired'
        : 'pending',
  };
}

/**
 * La persona confirma su email desde el link (#208): la página pide un botón, porque los lectores
 * de correo abren los links para revisarlos.
 *
 * Si ya es un contacto (por su email), la búsqueda se le suma y **mantiene su asesor**; si estaba
 * en la papelera, vuelve a la agenda. Si no, se registra como contacto nuevo con canal "Formulario
 * web", a cargo del asesor por defecto (sin él, queda sin agente). La búsqueda se guarda con envío
 * automático y la frecuencia que eligió, y su asesor se entera en la campana.
 *
 * Volver a confirmar no crea otra búsqueda.
 */
export class ConfirmSearchSubscription {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly tokens: SharedListingTokens;
      readonly assignee: DefaultAssignee;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: SearchSubscriptionTokenInput,
    actor: Actor,
  ): Promise<Result<SearchSubscriptionView, ConfirmSearchSubscriptionError>> {
    if (!actor.can(SUBSCRIBE_PERMISSION)) return err({ type: 'Forbidden' });
    const parsed = SearchSubscriptionTokenInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'SearchSubscriptionNotFound' });
    const tokenHash = this.deps.tokens.hashOf(parsed.data.token);
    const now = this.deps.clock.now();
    // Identity es otro módulo: se lee antes de la transacción.
    const assignee = await this.deps.assignee.find();

    return this.deps.uow.run(
      async (tx): Promise<Result<SearchSubscriptionView, ConfirmSearchSubscriptionError>> => {
        const subscription = await tx.searchSubscriptions.findByTokenHash(tokenHash);
        if (!subscription) return err({ type: 'SearchSubscriptionNotFound' });
        if (subscription.isConfirmed) return ok(searchSubscriptionView(subscription, now));
        if (subscription.isExpired(now)) return err({ type: 'SearchSubscriptionExpired' });
        const { contact } = subscription;
        // Pendiente y vigente: el nombre y el email solo se borran al confirmar.
        if (contact === undefined) throw new Error('Pending subscription without contact data');

        const client = await this.recordClient(tx, actor, subscription, contact, assignee, now);
        if (client.isErr()) return err(client.error);

        const limit = checkSavedSearchLimit(
          await tx.savedSearches.countActiveByClient(client.value.id),
        );
        if (limit.isErr()) return err(limit.error);
        const created = SavedSearch.create({
          id: nextId<'SavedSearch'>(this.deps.ids),
          clientId: client.value.id,
          fields: subscription.savedSearchFields(),
          now,
        });
        if (created.isErr()) return err(created.error);
        const search = created.value;
        await tx.savedSearches.save(search, actor.id);
        await tx.audit.record(
          auditCreated(actor, clientTarget('client.saved_search_created', client.value.id), {
            savedSearchId: search.id,
            searchSubscriptionId: subscription.id,
            ...savedSearchAuditState(search),
          }),
        );

        const confirmed = subscription.confirm(
          {
            clientId: client.value.id,
            savedSearchId: search.id,
            agentId: client.value.ownership.ownerId,
          },
          now,
        );
        if (confirmed.isErr()) return err(confirmed.error);
        await tx.searchSubscriptions.save(subscription, actor.id);
        await tx.events.publish(subscription.pullEvents());
        await tx.audit.record(
          auditAction(
            actor,
            {
              action: 'search_subscription.confirmed',
              entityType: 'search_subscription',
              entityId: subscription.id,
              clientIds: [client.value.id],
            },
            {
              clientId: { before: null, after: client.value.id },
              savedSearchId: { before: null, after: search.id },
            },
          ),
        );
        return ok(searchSubscriptionView(subscription, now));
      },
    );
  }

  /** El contacto de la suscripción: el que ya existe con ese email o uno nuevo. */
  private async recordClient(
    tx: ClientsTransaction,
    actor: Actor,
    subscription: SearchSubscription,
    contact: NonNullable<SearchSubscription['contact']>,
    assignee: Awaited<ReturnType<DefaultAssignee['find']>>,
    now: Date,
  ): Promise<Result<Client, MissingContactInfoError>> {
    const keys = { phones: [], emails: [contact.email] };
    const candidates = await tx.clients.findMatching(keys);
    let existing = findExistingClient(candidates, keys);
    // Se unificó con otro: la búsqueda va al que quedó.
    if (existing?.mergedIntoId !== undefined) {
      existing = await findClient(tx.clients, existing.mergedIntoId);
    }

    if (existing) {
      const before = clientAuditState(existing);
      // Estaba en la papelera y volvió a buscar: vuelve a la agenda.
      const restored = existing.restoreFromTrash(now).isOk();
      existing.recordContact('web_form', subscription.id, now);
      existing.completeProfile({
        name: contact.name,
        ...unclaimedContact(existing, candidates, { phone: undefined, email: contact.email }),
      });
      await tx.clients.save(existing, actor.id);
      await tx.events.publish(existing.pullEvents());
      if (restored) {
        await tx.audit.record(auditAction(actor, clientTarget('client.restored', existing.id)));
      }
      const changes = diffChanges(before, clientAuditState(existing));
      if (Object.keys(changes).length > 0) {
        await tx.audit.record(
          auditAction(actor, clientTarget('client.contact_recorded', existing.id), changes),
        );
      }
      return ok(existing);
    }

    const registered = Client.register({
      id: nextId<'Client'>(this.deps.ids),
      name: contact.name,
      email: contact.email,
      channel: 'web_form',
      channelExternalId: subscription.id,
      ...(assignee && { agent: { agentId: assignee.userId, branchId: assignee.branchId } }),
      now,
    });
    if (registered.isErr()) return err(registered.error);
    const client = registered.value;
    await tx.clients.save(client, actor.id);
    await tx.events.publish(client.pullEvents());
    await tx.audit.record(
      auditCreated(actor, clientTarget('client.registered', client.id), clientAuditState(client)),
    );
    return ok(client);
  }
}
