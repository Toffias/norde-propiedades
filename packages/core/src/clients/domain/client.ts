import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';
import type { Email } from '../../shared/domain/value-objects/email';
import type { Phone } from '../../shared/domain/value-objects/phone';

import type { ClientEvent } from './client.events';
import type { ClientChannel, ContactChannel } from './contact-channel';

export type ClientId = Id<'Client'>;

export interface ClientSnapshot {
  readonly id: ClientId;
  readonly name: string | undefined;
  readonly phone: Phone | undefined;
  readonly email: Email | undefined;
  readonly channels: readonly ClientChannel[];
  readonly createdAt: Date;
}

export interface MissingContactInfoError {
  readonly type: 'MissingContactInfo';
}

const MAX_NAME_LENGTH = 120;

function cleanName(name: string | undefined): string | undefined {
  const trimmed = name?.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed === '' ? undefined : trimmed;
}

/**
 * La persona, una sola aunque llegue por varios canales. Se identifica por teléfono o email
 * (la deduplicación la hace el caso de uso buscando por esas claves).
 */
export class Client extends AggregateRoot<ClientId, ClientEvent> {
  #state: Omit<ClientSnapshot, 'id'>;

  private constructor(id: ClientId, state: Omit<ClientSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

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
      name: cleanName(input.name),
      phone: input.phone,
      email: input.email,
      channels: [
        {
          channel: input.channel,
          externalId: input.channelExternalId,
          firstContactAt: input.now,
          lastContactAt: input.now,
        },
      ],
      createdAt: input.now,
    });
    client.record({
      type: 'clients.client_registered',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { clientId: input.id, channel: input.channel },
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

  get phone(): Phone | undefined {
    return this.#state.phone;
  }

  get email(): Email | undefined {
    return this.#state.email;
  }

  get channels(): readonly ClientChannel[] {
    return this.#state.channels;
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
      };
      return;
    }

    this.#state = {
      ...this.#state,
      channels: [
        ...this.#state.channels,
        { channel, externalId, firstContactAt: now, lastContactAt: now },
      ],
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
    this.#state = {
      ...this.#state,
      name: this.#state.name ?? cleanName(data.name),
      phone: this.#state.phone ?? data.phone,
      email: this.#state.email ?? data.email,
    };
  }

  toSnapshot(): ClientSnapshot {
    return { id: this.id, ...this.#state };
  }
}
