import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';
import type { Email } from '../../shared/domain/value-objects/email';
import type { Phone } from '../../shared/domain/value-objects/phone';

import type { ClientEvent } from './client.events';
import {
  CLIENT_TYPES,
  EMPTY_PROFILE,
  hasOwnerType,
  PROFILE_FIELDS,
  type ClientKind,
  type ClientProfile,
  type ClientType,
  type EmailKind,
  type PhoneKind,
} from './client-values';
import type { ClientChannel, ContactChannel } from './contact-channel';

export type ClientId = Id<'Client'>;

export interface ClientPhone {
  readonly kind: PhoneKind;
  readonly phone: Phone;
  /** Cuándo prefiere que lo llamen ("de 9 a 13"). */
  readonly contactHours: string | undefined;
}

export interface ClientEmail {
  readonly kind: EmailKind;
  readonly email: Email;
}

export interface ClientSnapshot {
  readonly id: ClientId;
  readonly kind: ClientKind;
  readonly name: string | undefined;
  /** El primero es el principal: con él se deduplica y lo usa el agente de IA. */
  readonly phones: readonly ClientPhone[];
  /** El primero es el principal. */
  readonly emails: readonly ClientEmail[];
  readonly clientTypes: readonly ClientType[];
  /** Agente responsable (usuario de identity). Sin agente, es "de otros" para todos. */
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
  readonly profile: ClientProfile;
  readonly channels: readonly ClientChannel[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

export interface MissingContactInfoError {
  readonly type: 'MissingContactInfo';
}
export interface MissingNameError {
  readonly type: 'MissingName';
}
/** Un contacto de la papelera no se edita: primero se restaura. */
export interface ClientInTrashError {
  readonly type: 'ClientInTrash';
}
export interface ClientAlreadyDeletedError {
  readonly type: 'ClientAlreadyDeleted';
}
export interface ClientNotDeletedError {
  readonly type: 'ClientNotDeleted';
}

const MAX_NAME_LENGTH = 120;

function cleanName(name: string | undefined): string | undefined {
  const trimmed = name?.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed === '' ? undefined : trimmed;
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Sin repetidos (el mismo número con o sin el 9 es el mismo): queda el primero. */
function uniquePhones(phones: readonly ClientPhone[]): ClientPhone[] {
  const unique: ClientPhone[] = [];
  for (const entry of phones) {
    if (unique.some((u) => u.phone.sameContactAs(entry.phone))) continue;
    unique.push({ ...entry, contactHours: cleanText(entry.contactHours) });
  }
  return unique;
}

function uniqueEmails(emails: readonly ClientEmail[]): ClientEmail[] {
  const unique: ClientEmail[] = [];
  for (const entry of emails) {
    if (!unique.some((u) => u.email.equals(entry.email))) unique.push(entry);
  }
  return unique;
}

/** Los tipos sin repetir y en el orden del catálogo: el orden en que se marcaron no es un cambio. */
function normalizeTypes(types: readonly ClientType[]): ClientType[] {
  return CLIENT_TYPES.filter((type) => types.includes(type));
}

function samePhones(a: readonly ClientPhone[], b: readonly ClientPhone[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, i) => {
      const other = b[i];
      return (
        entry.kind === other?.kind &&
        entry.phone.e164 === other.phone.e164 &&
        entry.contactHours === other.contactHours
      );
    })
  );
}

function sameEmails(a: readonly ClientEmail[], b: readonly ClientEmail[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, i) => {
      const other = b[i];
      return entry.kind === other?.kind && entry.email.equals(other.email);
    })
  );
}

/**
 * La persona, empresa o grupo con quien Norde tiene relación: uno solo aunque llegue por varios
 * canales. Se identifica por sus teléfonos y emails (la deduplicación la hace el caso de uso
 * buscando por esas claves, con `findExistingClient`).
 */
export class Client extends AggregateRoot<ClientId, ClientEvent> {
  #state: Omit<ClientSnapshot, 'id'>;

  private constructor(id: ClientId, state: Omit<ClientSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  /** Un contacto entrante (agente de IA, formulario, portal), con el canal por el que llegó. */
  static register(input: {
    readonly id: ClientId;
    readonly name?: string | undefined;
    readonly phone?: Phone | undefined;
    readonly email?: Email | undefined;
    readonly channel: ContactChannel;
    readonly channelExternalId: string;
    readonly now: Date;
  }): Result<Client, MissingContactInfoError> {
    // Sin teléfono ni email no hay cómo volver a contactarlo ni deduplicarlo.
    if (!input.phone && !input.email) return err({ type: 'MissingContactInfo' });

    const client = new Client(input.id, {
      kind: 'person',
      name: cleanName(input.name),
      // Por WhatsApp escribe desde un celular.
      phones: input.phone
        ? [
            {
              kind: input.channel === 'whatsapp' ? 'mobile' : 'main',
              phone: input.phone,
              contactHours: undefined,
            },
          ]
        : [],
      emails: input.email ? [{ kind: 'main', email: input.email }] : [],
      clientTypes: [],
      agentId: undefined,
      branchId: undefined,
      profile: EMPTY_PROFILE,
      channels: [
        {
          channel: input.channel,
          externalId: input.channelExternalId,
          firstContactAt: input.now,
          lastContactAt: input.now,
        },
      ],
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: undefined,
      deletedBy: undefined,
    });
    client.record({
      type: 'clients.client_registered',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { clientId: input.id, channel: input.channel },
    });
    return ok(client);
  }

  /** El alta manual desde el panel: con nombre y al menos un teléfono o email. */
  static create(input: {
    readonly id: ClientId;
    readonly kind: ClientKind;
    readonly name: string;
    readonly phones: readonly ClientPhone[];
    readonly emails: readonly ClientEmail[];
    readonly clientTypes: readonly ClientType[];
    readonly agentId: string | undefined;
    readonly branchId: string | undefined;
    readonly profile: Partial<ClientProfile>;
    readonly now: Date;
  }): Result<Client, MissingNameError | MissingContactInfoError> {
    const name = cleanName(input.name);
    if (name === undefined) return err({ type: 'MissingName' });
    const phones = uniquePhones(input.phones);
    const emails = uniqueEmails(input.emails);
    if (phones.length === 0 && emails.length === 0) return err({ type: 'MissingContactInfo' });

    const client = new Client(input.id, {
      kind: input.kind,
      name,
      phones,
      emails,
      clientTypes: normalizeTypes(input.clientTypes),
      agentId: input.agentId,
      branchId: input.branchId,
      profile: mergeProfile(EMPTY_PROFILE, input.profile),
      channels: [],
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: undefined,
      deletedBy: undefined,
    });
    client.record({
      type: 'clients.client_registered',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { clientId: input.id, channel: 'office' },
    });
    return ok(client);
  }

  static restore(snapshot: ClientSnapshot): Client {
    const { id, ...state } = snapshot;
    return new Client(id, state);
  }

  get name(): string | undefined {
    return this.#state.name;
  }

  /** El teléfono principal. */
  get phone(): Phone | undefined {
    return this.#state.phones[0]?.phone;
  }

  /** El email principal. */
  get email(): Email | undefined {
    return this.#state.emails[0]?.email;
  }

  get phones(): readonly ClientPhone[] {
    return this.#state.phones;
  }

  get emails(): readonly ClientEmail[] {
    return this.#state.emails;
  }

  get channels(): readonly ClientChannel[] {
    return this.#state.channels;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  /** Es propietario: sus datos de contacto se muestran solo con `clients:read-owners`. */
  get isOwner(): boolean {
    return hasOwnerType(this.#state.clientTypes);
  }

  /** De quién es, para las reglas de pertenencia: el agente responsable y su sucursal. */
  get ownership(): {
    readonly ownerId: string | undefined;
    readonly ownerBranchId: string | undefined;
  } {
    return { ownerId: this.#state.agentId, ownerBranchId: this.#state.branchId };
  }

  /** ¿Comparte algún teléfono o email con este contacto? */
  sharesContactWith(contact: {
    readonly phones: readonly Phone[];
    readonly emails: readonly Email[];
  }): boolean {
    return (
      this.#state.phones.some((p) =>
        contact.phones.some((other) => p.phone.sameContactAs(other)),
      ) || this.#state.emails.some((e) => contact.emails.some((other) => e.email.equals(other)))
    );
  }

  /** Registra que el cliente se comunicó por un canal: lo agrega o actualiza la última interacción. */
  recordContact(channel: ContactChannel, externalId: string, now: Date): void {
    const existing = this.#state.channels.find(
      (c) => c.channel === channel && c.externalId === externalId,
    );
    if (existing) {
      this.#state = {
        ...this.#state,
        channels: this.#state.channels.map((c) =>
          c === existing ? { ...c, lastContactAt: now } : c,
        ),
        updatedAt: now,
      };
      return;
    }

    this.#state = {
      ...this.#state,
      channels: [
        ...this.#state.channels,
        { channel, externalId, firstContactAt: now, lastContactAt: now },
      ],
      updatedAt: now,
    };
    this.record({
      type: 'clients.client_channel_added',
      aggregateId: this.id,
      occurredAt: now,
      payload: { clientId: this.id, channel },
    });
  }

  /**
   * Completa los datos que faltan. No pisa los existentes: un dato distinto al guardado
   * (otro nombre, otro email) lo revisa una persona desde el panel.
   */
  completeProfile(data: {
    readonly name?: string | undefined;
    readonly phone?: Phone | undefined;
    readonly email?: Email | undefined;
  }): void {
    const { phones, emails } = this.#state;
    this.#state = {
      ...this.#state,
      name: this.#state.name ?? cleanName(data.name),
      phones:
        phones.length === 0 && data.phone
          ? [{ kind: 'main', phone: data.phone, contactHours: undefined }]
          : phones,
      emails: emails.length === 0 && data.email ? [{ kind: 'main', email: data.email }] : emails,
    };
  }

  rename(name: string, now: Date): Result<boolean, MissingNameError | ClientInTrashError> {
    if (this.isDeleted) return err({ type: 'ClientInTrash' });
    const cleaned = cleanName(name);
    if (cleaned === undefined) return err({ type: 'MissingName' });
    if (cleaned === this.#state.name) return ok(false);
    this.#state = { ...this.#state, name: cleaned, updatedAt: now };
    return ok(true);
  }

  /**
   * Reemplaza los teléfonos y emails (el primero de cada lista es el principal). Los repetidos se
   * descartan; no puede quedar sin ninguno de los dos.
   */
  changeContactInfo(
    contact: { readonly phones: readonly ClientPhone[]; readonly emails: readonly ClientEmail[] },
    now: Date,
  ): Result<boolean, MissingContactInfoError | ClientInTrashError> {
    if (this.isDeleted) return err({ type: 'ClientInTrash' });
    const phones = uniquePhones(contact.phones);
    const emails = uniqueEmails(contact.emails);
    if (phones.length === 0 && emails.length === 0) return err({ type: 'MissingContactInfo' });
    if (samePhones(phones, this.#state.phones) && sameEmails(emails, this.#state.emails)) {
      return ok(false);
    }
    this.#state = { ...this.#state, phones, emails, updatedAt: now };
    return ok(true);
  }

  changeTypes(types: readonly ClientType[], now: Date): Result<boolean, ClientInTrashError> {
    if (this.isDeleted) return err({ type: 'ClientInTrash' });
    const clientTypes = normalizeTypes(types);
    const current = this.#state.clientTypes;
    if (clientTypes.length === current.length && clientTypes.every((t, i) => t === current[i])) {
      return ok(false);
    }
    this.#state = { ...this.#state, clientTypes, updatedAt: now };
    return ok(true);
  }

  /** Edita el tipo de registro y los datos de la ficha. Lo que no viene, no cambia. */
  updateDetails(
    details: { readonly kind?: ClientKind | undefined; readonly profile?: Partial<ClientProfile> },
    now: Date,
  ): Result<boolean, ClientInTrashError> {
    if (this.isDeleted) return err({ type: 'ClientInTrash' });
    const kind = details.kind ?? this.#state.kind;
    const profile = mergeProfile(this.#state.profile, details.profile ?? {});
    const changed =
      kind !== this.#state.kind ||
      PROFILE_FIELDS.some((field) => profile[field] !== this.#state.profile[field]);
    if (!changed) return ok(false);
    this.#state = { ...this.#state, kind, profile, updatedAt: now };
    return ok(true);
  }

  /** Cambia el agente responsable; el contacto pasa a la sucursal del agente. */
  assignAgent(
    agent: { readonly agentId: string | undefined; readonly branchId: string | undefined },
    now: Date,
  ): Result<boolean, ClientInTrashError> {
    if (this.isDeleted) return err({ type: 'ClientInTrash' });
    if (agent.agentId === this.#state.agentId && agent.branchId === this.#state.branchId) {
      return ok(false);
    }
    this.#state = {
      ...this.#state,
      agentId: agent.agentId,
      branchId: agent.branchId,
      updatedAt: now,
    };
    return ok(true);
  }

  /** Baja lógica: va a la papelera con quién lo borró y cuándo. */
  delete(by: string, now: Date): Result<void, ClientAlreadyDeletedError> {
    if (this.isDeleted) return err({ type: 'ClientAlreadyDeleted' });
    this.#state = { ...this.#state, deletedAt: now, deletedBy: by, updatedAt: now };
    this.record({
      type: 'clients.client_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: { clientId: this.id },
    });
    return ok(undefined);
  }

  restoreFromTrash(now: Date): Result<void, ClientNotDeletedError> {
    if (!this.isDeleted) return err({ type: 'ClientNotDeleted' });
    this.#state = { ...this.#state, deletedAt: undefined, deletedBy: undefined, updatedAt: now };
    this.record({
      type: 'clients.client_restored',
      aggregateId: this.id,
      occurredAt: now,
      payload: { clientId: this.id },
    });
    return ok(undefined);
  }

  toSnapshot(): ClientSnapshot {
    return { id: this.id, ...this.#state };
  }
}

function mergeProfile(current: ClientProfile, changes: Partial<ClientProfile>): ClientProfile {
  const merged: Record<keyof ClientProfile, string | undefined> = { ...current };
  for (const field of PROFILE_FIELDS) {
    if (field in changes) merged[field] = cleanText(changes[field]);
  }
  return merged;
}
