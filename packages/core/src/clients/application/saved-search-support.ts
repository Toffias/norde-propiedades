import { canActOn, OWNERSHIP_RULES } from '../../identity';
import {
  err,
  ok,
  toAuditValue,
  type Actor,
  type AuditState,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { SavedSearchValues } from '../contracts';
import type { Client, ClientInTrashError } from '../domain/client';
import type { SavedSearch, SavedSearchFields } from '../domain/saved-search';

import { findClient, type ClientNotFoundError } from './client-support';
import { findOpportunity, type OpportunityNotFoundError } from './opportunity-support';
import type { ClientsTransaction } from './ports/clients-transaction';
import { idOf } from './tag-support';

// Lo que comparten los casos de uso de las búsquedas guardadas.

/** No existe, es de otro cliente o (al editarla) está en la papelera. */
export interface SavedSearchNotFoundError {
  readonly type: 'SavedSearchNotFound';
}

/** El cliente, si el actor lo puede editar y no está en la papelera. */
export async function findEditableClient(
  tx: ClientsTransaction,
  actor: Actor,
  clientId: string,
): Promise<Result<Client, ClientNotFoundError | ForbiddenError | ClientInTrashError>> {
  const client = await findClient(tx.clients, clientId);
  if (!client) return err({ type: 'ClientNotFound' });
  if (!canActOn(actor, OWNERSHIP_RULES.clientsUpdate, client.ownership)) {
    return err({ type: 'Forbidden' });
  }
  if (client.isDeleted) return err({ type: 'ClientInTrash' });
  return ok(client);
}

/** La búsqueda, si es de este cliente (incluye las borradas). */
export async function findClientSearch(
  tx: ClientsTransaction,
  client: Client,
  rawId: string,
): Promise<SavedSearch | undefined> {
  const id = idOf<'SavedSearch'>(rawId);
  const search = id === undefined ? undefined : await tx.savedSearches.findById(id);
  return search?.clientId === client.id ? search : undefined;
}

/** Una búsqueda solo se vincula a una oportunidad abierta del mismo cliente. */
export async function checkSearchOpportunity(
  tx: ClientsTransaction,
  client: Client,
  opportunityId: string | undefined,
): Promise<Result<void, OpportunityNotFoundError>> {
  if (opportunityId === undefined) return ok(undefined);
  const opportunity = await findOpportunity(tx, opportunityId);
  if (opportunity?.clientId !== client.id || !opportunity.isOpen()) {
    return err({ type: 'OpportunityNotFound' });
  }
  return ok(undefined);
}

/** Del input del formulario (montos ya en centavos) a los campos del dominio. */
export function toSavedSearchFields(values: SavedSearchValues): SavedSearchFields {
  return {
    name: values.name,
    opportunityId: values.opportunityId,
    operation: values.operation,
    propertyTypes: values.propertyTypes,
    currency: values.currency,
    minPriceCents: values.minPrice,
    maxPriceCents: values.maxPrice,
    locationIds: values.locationIds,
    minRooms: values.minRooms,
    autoSend: values.autoSend,
  };
}

/** Lo que se audita de una búsqueda, crudo: centavos, IDs. Las listas vacías no aparecen. */
export function savedSearchAuditState(search: SavedSearch): AuditState {
  const f = search.fields;
  const list = (items: readonly string[]) => (items.length === 0 ? undefined : toAuditValue(items));
  return {
    name: f.name,
    opportunityId: f.opportunityId,
    operation: f.operation,
    propertyTypes: list(f.propertyTypes),
    currency: f.currency,
    minPriceCents: f.minPriceCents,
    maxPriceCents: f.maxPriceCents,
    locationIds: list(f.locationIds),
    minRooms: f.minRooms,
    autoSend: f.autoSend,
  };
}
