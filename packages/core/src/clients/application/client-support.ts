import { accessScope, canActOn, OWNERSHIP_RULES, visibilityFilter } from '../../identity';
import {
  Email,
  err,
  ok,
  parseId,
  Phone,
  toAuditValue,
  type Actor,
  type AuditState,
  type AuditTarget,
  type ForbiddenError,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../shared';
import type {
  ClientDuplicateRef,
  ClientEmailInput,
  ClientKindValue,
  ClientLetter,
  ClientListRow,
  ClientPhoneInput,
  ClientProfileInput,
  ClientTaggedValue,
  ClientTypeValue,
  ClientUserRef,
  ClientViewValue,
} from '../contracts';
import type { Client, ClientEmail, ClientPhone } from '../domain/client';
import type { ClientRepository } from '../domain/client.repository';
import {
  EMPTY_PROFILE,
  hasOwnerType,
  OWNER_CLIENT_TYPES,
  PROFILE_FIELDS,
  type ClientProfile,
} from '../domain/client-values';
import { maskEmail, maskPhone } from '../domain/contact-masking';

import type { ClientAgents } from './ports/client-agents';
import type { ClientFilterCriteria, ClientListItem } from './ports/client-list-query';

// Lo que comparten los casos de uso de la agenda de contactos.

export interface ClientNotFoundError {
  readonly type: 'ClientNotFound';
}

export interface InvalidInputError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

/** Ya hay un contacto con ese teléfono o email (puede estar en la papelera). */
export interface DuplicateClientError {
  readonly type: 'DuplicateClient';
  readonly clientId: string;
  readonly trashed: boolean;
}

/** El agente elegido no existe o no está activo. */
export interface AgentNotFoundError {
  readonly type: 'AgentNotFound';
}

/** Un `safeParse` fallido, como error esperado. */
export function invalidInput(error: {
  readonly issues: readonly { readonly message: string }[];
}): InvalidInputError {
  return { type: 'InvalidInput', issues: error.issues.map((issue) => issue.message) };
}

export function clientTarget(action: string, clientId: string): AuditTarget {
  return { action, entityType: 'client', entityId: clientId, clientIds: [clientId] };
}

/**
 * Todo lo que se audita de un cliente, crudo: teléfonos en E.164, el agente y la sucursal por ID.
 * Los teléfonos y emails son filas hijas y se registran contra el cliente.
 */
export function clientAuditState(client: Client): AuditState {
  const s = client.toSnapshot();
  // Una lista vacía es "sin dato": no aparece en el alta.
  const list = (items: readonly unknown[]) =>
    items.length === 0 ? undefined : toAuditValue(items);
  return {
    kind: s.kind,
    name: s.name,
    phones: list(
      s.phones.map((p) => ({ kind: p.kind, number: p.phone.e164, contactHours: p.contactHours })),
    ),
    emails: list(s.emails.map((e) => ({ kind: e.kind, address: e.email.value }))),
    clientTypes: list(s.clientTypes),
    agentId: s.agentId,
    branchId: s.branchId,
    ...s.profile,
  };
}

export async function findClient(
  clients: ClientRepository,
  rawId: string,
): Promise<Client | undefined> {
  const id = parseId<'Client'>(rawId);
  return id.isOk() ? clients.findById(id.value) : undefined;
}

/** Puede ver al menos sus contactos. */
export function canReadClients(actor: Actor): boolean {
  return accessScope(actor, OWNERSHIP_RULES.clientsRead) !== undefined;
}

/** Puede borrar (y por lo tanto ver la papelera de) al menos sus contactos. */
export function canDeleteClients(actor: Actor): boolean {
  return accessScope(actor, OWNERSHIP_RULES.clientsDelete) !== undefined;
}

/** Los datos de contacto de un propietario se ven solo con "Ver datos de propietarios". */
export function masksOwnerContact(actor: Actor, clientTypes: readonly ClientTypeValue[]): boolean {
  return hasOwnerType(clientTypes) && !actor.can('clients:read-owners');
}

export function parsePhones(
  inputs: readonly ClientPhoneInput[],
): Result<ClientPhone[], InvalidPhoneError> {
  const phones: ClientPhone[] = [];
  for (const input of inputs) {
    const phone = Phone.create(input.number);
    if (phone.isErr()) return err(phone.error);
    phones.push({ kind: input.kind, phone: phone.value, contactHours: input.contactHours });
  }
  return ok(phones);
}

export function parseEmails(
  inputs: readonly ClientEmailInput[],
): Result<ClientEmail[], InvalidEmailError> {
  const emails: ClientEmail[] = [];
  for (const input of inputs) {
    const email = Email.create(input.address);
    if (email.isErr()) return err(email.error);
    emails.push({ kind: input.kind, email: email.value });
  }
  return ok(emails);
}

/**
 * Los datos de la ficha tal como los recibe el dominio. La sección se guarda entera: un campo que
 * no viene (el formulario lo dejó vacío) se borra.
 */
export function toProfile(input: ClientProfileInput): ClientProfile {
  const profile: Record<keyof ClientProfile, string | undefined> = { ...EMPTY_PROFILE };
  for (const field of PROFILE_FIELDS) profile[field] = input[field];
  return profile;
}

/**
 * El agente de un contacto y su sucursal: el contacto queda en la sucursal del agente. Sin agente,
 * sin sucursal.
 */
export async function resolveAgent(
  agents: ClientAgents,
  agentId: string | undefined,
): Promise<
  Result<
    { readonly agentId: string | undefined; readonly branchId: string | undefined },
    AgentNotFoundError
  >
> {
  if (agentId === undefined) return ok({ agentId: undefined, branchId: undefined });
  const agent = await agents.find(agentId);
  if (agent === undefined) return err({ type: 'AgentNotFound' });
  return ok({ agentId, branchId: agent.branchId });
}

// ---------- Listado ----------

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

function dayRange(
  from: string | undefined,
  to: string | undefined,
): { readonly from: Date | undefined; readonly to: Date | undefined } {
  return {
    from: from === undefined ? undefined : startOfDay(from),
    to: to === undefined ? undefined : new Date(startOfDay(to).getTime() + DAY_MS),
  };
}

/** Los filtros del listado ya validados por el contract. */
export interface ParsedClientFilter {
  readonly q?: string | undefined;
  readonly agentId?: string | undefined;
  readonly branchId?: string | undefined;
  readonly kind?: ClientKindValue | undefined;
  readonly clientType?: ClientTypeValue | undefined;
  readonly tagged?: ClientTaggedValue | undefined;
  readonly tagId?: string | undefined;
  readonly letter?: ClientLetter | undefined;
  readonly owners: boolean;
  readonly createdFrom?: string | undefined;
  readonly createdTo?: string | undefined;
  readonly updatedFrom?: string | undefined;
  readonly updatedTo?: string | undefined;
  readonly view: ClientViewValue;
}

/**
 * Traduce los filtros a criterios del puerto de consulta: la visibilidad sale de los permisos del
 * actor y la papelera la ve solo quien puede borrar.
 */
export function resolveClientFilter(
  filter: ParsedClientFilter,
  actor: Actor,
): Result<ClientFilterCriteria, ForbiddenError> {
  if (filter.view === 'trash' && !canDeleteClients(actor)) return err({ type: 'Forbidden' });
  return ok({
    view: filter.view,
    visibility: visibilityFilter(actor, OWNERSHIP_RULES.clientsRead),
    text: filter.q,
    agentId: filter.agentId,
    branchId: filter.branchId,
    kind: filter.kind,
    clientType: filter.clientType,
    tagged: filter.tagged,
    tagId: filter.tagId,
    letter: filter.letter,
    anyOfTypes: filter.owners ? OWNER_CLIENT_TYPES : undefined,
    created: dayRange(filter.createdFrom, filter.createdTo),
    updated: dayRange(filter.updatedFrom, filter.updatedTo),
  });
}

/** Resuelve los nombres de agentes y de quién borró, y enmascara a los propietarios. */
export async function toClientRows(
  items: readonly ClientListItem[],
  agents: ClientAgents,
  actor: Actor,
): Promise<ClientListRow[]> {
  const userIds = new Set<string>();
  for (const item of items) {
    if (item.agentId !== undefined) userIds.add(item.agentId);
    if (item.deletedBy !== undefined) userIds.add(item.deletedBy);
  }
  const names = await agents.names([...userIds]);
  const ref = (id: string | undefined): ClientUserRef | undefined =>
    id === undefined ? undefined : { id, name: names.get(id) };

  return items.map(({ agentId, deletedBy, ...item }) => {
    const masked = masksOwnerContact(actor, item.clientTypes);
    return {
      ...item,
      phone: masked && item.phone !== undefined ? maskPhone(item.phone) : item.phone,
      mobile: masked && item.mobile !== undefined ? maskPhone(item.mobile) : item.mobile,
      email: masked && item.email !== undefined ? maskEmail(item.email) : item.email,
      contactMasked: masked,
      agent: ref(agentId),
      deletedBy: ref(deletedBy),
    };
  });
}

/** Un contacto que coincide, con lo justo para decidir: nombre, agente y si se puede abrir. */
export function toDuplicateRef(
  client: Client,
  names: ReadonlyMap<string, string>,
  actor: Actor,
): ClientDuplicateRef {
  const { agentId } = client.toSnapshot();
  return {
    id: client.id,
    name: client.name,
    agent: agentId === undefined ? undefined : { id: agentId, name: names.get(agentId) },
    trashed: client.isDeleted,
    canOpen: canActOn(actor, OWNERSHIP_RULES.clientsRead, client.ownership),
  };
}
