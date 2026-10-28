import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

export type QuickReplyId = Id<'QuickReply'>;

export const MAX_QUICK_REPLY_NAME_LENGTH = 80;
export const MAX_QUICK_REPLY_SUBJECT_LENGTH = 150;
/** Lo mismo que el mensaje de un envío: el cuerpo se usa como ese mensaje. */
export const MAX_QUICK_REPLY_BODY_LENGTH = 1000;

/**
 * Las variables que se pueden usar en el asunto y el cuerpo, como `[[nombre_contacto]]`. Se
 * completan al enviar, con los datos del contacto y del asesor que envía.
 */
export const QUICK_REPLY_VARIABLES = [
  'nombre_contacto',
  'primer_nombre_contacto',
  'nombre_asesor',
  'nombre_empresa',
] as const;
export type QuickReplyVariable = (typeof QUICK_REPLY_VARIABLES)[number];

export type QuickReplyValues = Readonly<Record<QuickReplyVariable, string | undefined>>;

const VARIABLE_PATTERN = /\[\[\s*([a-z0-9_]+)\s*\]\]/gi;

function isVariable(name: string): name is QuickReplyVariable {
  return QUICK_REPLY_VARIABLES.some((variable) => variable === name);
}

/** Las variables escritas que no existen, sin repetir y en minúsculas. */
export function unknownVariables(text: string): string[] {
  const names = [...text.matchAll(VARIABLE_PATTERN)].map((m) => (m[1] ?? '').toLowerCase());
  return [...new Set(names.filter((name) => !isVariable(name)))];
}

/**
 * Completa las variables con sus valores. Una sin valor (el contacto no tiene nombre) queda vacía;
 * una que no existe queda como estaba, porque el asesor la pudo haber escrito a propósito.
 */
export function fillVariables(text: string, values: QuickReplyValues): string {
  return text.replace(VARIABLE_PATTERN, (match, raw: string) => {
    const name = raw.toLowerCase();
    return isVariable(name) ? (values[name] ?? '') : match;
  });
}

/** El primer nombre de un nombre completo ("Ana María Pérez" → "Ana"). */
export function firstNameOf(name: string | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0];
  return first === undefined || first === '' ? undefined : first;
}

export interface QuickReplySnapshot {
  readonly id: QuickReplyId;
  readonly name: string;
  /** Para el email; por WhatsApp no se usa. */
  readonly subject: string | undefined;
  readonly body: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type InvalidQuickReplyError =
  | { readonly type: 'InvalidQuickReply'; readonly reason: 'name' | 'subject' | 'body' }
  | {
      readonly type: 'InvalidQuickReply';
      readonly reason: 'unknown_variables';
      readonly variables: readonly string[];
    };

export interface QuickReplyContent {
  readonly name: string;
  readonly subject: string | undefined;
  readonly body: string;
}

function cleanContent(input: QuickReplyContent): Result<QuickReplyContent, InvalidQuickReplyError> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name === '' || name.length > MAX_QUICK_REPLY_NAME_LENGTH) {
    return err({ type: 'InvalidQuickReply', reason: 'name' });
  }
  const subject = input.subject?.trim().replace(/\s+/g, ' ');
  if (subject !== undefined && subject.length > MAX_QUICK_REPLY_SUBJECT_LENGTH) {
    return err({ type: 'InvalidQuickReply', reason: 'subject' });
  }
  const body = input.body.trim();
  if (body === '' || body.length > MAX_QUICK_REPLY_BODY_LENGTH) {
    return err({ type: 'InvalidQuickReply', reason: 'body' });
  }
  const unknown = unknownVariables(`${subject ?? ''}\n${body}`);
  if (unknown.length > 0) {
    return err({ type: 'InvalidQuickReply', reason: 'unknown_variables', variables: unknown });
  }
  return ok({ name, subject: subject === '' ? undefined : subject, body });
}

/**
 * Una respuesta rápida: una plantilla de mensaje (asunto y cuerpo, con variables) que el asesor
 * elige al enviarle algo a un contacto. Las inactivas no se ofrecen.
 */
export class QuickReply extends AggregateRoot<QuickReplyId, never> {
  #state: Omit<QuickReplySnapshot, 'id'>;

  private constructor(id: QuickReplyId, state: Omit<QuickReplySnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  /** Nace activa. */
  static create(
    input: QuickReplyContent & { readonly id: QuickReplyId; readonly now: Date },
  ): Result<QuickReply, InvalidQuickReplyError> {
    const content = cleanContent(input);
    if (content.isErr()) return err(content.error);
    return ok(
      new QuickReply(input.id, {
        ...content.value,
        isActive: true,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(snapshot: QuickReplySnapshot): QuickReply {
    const { id, ...state } = snapshot;
    return new QuickReply(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get isActive(): boolean {
    return this.#state.isActive;
  }

  /** Cambia el nombre, el asunto y el cuerpo. Devuelve si cambió algo. */
  edit(input: QuickReplyContent, now: Date): Result<boolean, InvalidQuickReplyError> {
    const content = cleanContent(input);
    if (content.isErr()) return err(content.error);
    const { name, subject, body } = content.value;
    const s = this.#state;
    if (name === s.name && subject === s.subject && body === s.body) return ok(false);
    this.#state = { ...s, name, subject, body, updatedAt: now };
    return ok(true);
  }

  /** Activa o inactiva. Devuelve si cambió. */
  setActive(active: boolean, now: Date): boolean {
    if (active === this.#state.isActive) return false;
    this.#state = { ...this.#state, isActive: active, updatedAt: now };
    return true;
  }

  toSnapshot(): QuickReplySnapshot {
    return { id: this.id, ...this.#state };
  }
}
