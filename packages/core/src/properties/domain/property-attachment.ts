import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { PropertyId } from './property';

export type PropertyAttachmentId = Id<'PropertyAttachment'>;

/** Escrituras, reglamentos, planos en PDF, planillas: documentos, no fotos. */
export const ATTACHMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_NAME_LENGTH = 150;

export interface PropertyAttachmentSnapshot {
  readonly id: PropertyAttachmentId;
  readonly propertyId: PropertyId;
  readonly name: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly showOnWeb: boolean;
  readonly uploadedBy: string;
  readonly deletedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UnsupportedAttachmentTypeError {
  readonly type: 'UnsupportedAttachmentType';
}
export interface AttachmentTooLargeError {
  readonly type: 'AttachmentTooLarge';
  readonly maxBytes: number;
}
export interface InvalidAttachmentNameError {
  readonly type: 'InvalidAttachmentName';
}

/** Caracteres de control y separadores de carpeta. */
function isUnsafe(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 0x20 || code === 0x7f || char === '/' || char === '\\';
}

/** Sin separadores de carpeta ni caracteres de control: el nombre se muestra y se descarga así. */
function cleanName(name: string): string | undefined {
  // Por código: solo se cambian los de control, así que los emojis compuestos se vuelven a unir.
  const clean = Array.from(name, (char) => (isUnsafe(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return clean === '' || clean.length > MAX_NAME_LENGTH ? undefined : clean;
}

/**
 * Archivo adjunto de una propiedad (escritura, reglamento). Se descarga a través del panel, que
 * autoriza cada pedido. Al borrarlo queda la baja lógica: el archivo se conserva.
 */
export class PropertyAttachment extends AggregateRoot<PropertyAttachmentId, never> {
  #state: Omit<PropertyAttachmentSnapshot, 'id'>;

  private constructor(id: PropertyAttachmentId, state: Omit<PropertyAttachmentSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static validateUpload(file: {
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
  }): Result<
    string,
    UnsupportedAttachmentTypeError | AttachmentTooLargeError | InvalidAttachmentNameError
  > {
    if (!ATTACHMENT_TYPES.some((type) => type === file.contentType)) {
      return err({ type: 'UnsupportedAttachmentType' });
    }
    if (file.sizeBytes > MAX_ATTACHMENT_BYTES) {
      return err({ type: 'AttachmentTooLarge', maxBytes: MAX_ATTACHMENT_BYTES });
    }
    const name = cleanName(file.fileName);
    return name === undefined ? err({ type: 'InvalidAttachmentName' }) : ok(name);
  }

  static upload(input: {
    readonly id: PropertyAttachmentId;
    readonly propertyId: PropertyId;
    readonly fileName: string;
    readonly storageKey: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly uploadedBy: string;
    readonly now: Date;
  }): Result<
    PropertyAttachment,
    UnsupportedAttachmentTypeError | AttachmentTooLargeError | InvalidAttachmentNameError
  > {
    const name = PropertyAttachment.validateUpload(input);
    if (name.isErr()) return err(name.error);
    return ok(
      new PropertyAttachment(input.id, {
        propertyId: input.propertyId,
        name: name.value,
        storageKey: input.storageKey,
        mimeType: input.contentType,
        sizeBytes: input.sizeBytes,
        showOnWeb: false,
        uploadedBy: input.uploadedBy,
        deletedAt: undefined,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(snapshot: PropertyAttachmentSnapshot): PropertyAttachment {
    const { id, ...state } = snapshot;
    return new PropertyAttachment(id, state);
  }

  get propertyId(): PropertyId {
    return this.#state.propertyId;
  }

  get name(): string {
    return this.#state.name;
  }

  get storageKey(): string {
    return this.#state.storageKey;
  }

  get mimeType(): string {
    return this.#state.mimeType;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  /** Nombre y "Mostrar en la web". Devuelve `false` si no cambió. */
  update(
    change: { readonly name?: string; readonly showOnWeb?: boolean },
    now: Date,
  ): Result<boolean, InvalidAttachmentNameError> {
    let name = this.#state.name;
    if (change.name !== undefined) {
      const clean = cleanName(change.name);
      if (clean === undefined) return err({ type: 'InvalidAttachmentName' });
      name = clean;
    }
    const showOnWeb = change.showOnWeb ?? this.#state.showOnWeb;
    if (name === this.#state.name && showOnWeb === this.#state.showOnWeb) return ok(false);
    this.#state = { ...this.#state, name, showOnWeb, updatedAt: now };
    return ok(true);
  }

  /** Baja lógica. Devuelve `false` si ya estaba borrado. */
  delete(now: Date): boolean {
    if (this.isDeleted) return false;
    this.#state = { ...this.#state, deletedAt: now, updatedAt: now };
    return true;
  }

  toSnapshot(): PropertyAttachmentSnapshot {
    return { id: this.id, ...this.#state };
  }
}
