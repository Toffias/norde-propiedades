import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { MediaOwner } from './media-owner';

export type MediaItemId = Id<'MediaItem'>;

/** Fotos y planos se suben; videos y recorridos 360 son un link. */
export const MEDIA_KINDS = ['photo', 'floor_plan', 'video', 'tour_360'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_ROTATIONS = [0, 90, 180, 270] as const;
export type MediaRotation = (typeof MEDIA_ROTATIONS)[number];

/** Estado de las variantes (miniatura, web, marca de agua) que genera el job. */
export const MEDIA_PROCESSING_STATUSES = ['pending', 'ready', 'failed'] as const;
export type MediaProcessingStatus = (typeof MEDIA_PROCESSING_STATUSES)[number];

/** Claves de storage de las variantes generadas. La original nunca se modifica. */
export interface MediaVariants {
  readonly thumbnail?: string;
  readonly web?: string;
  /** Solo si la marca de agua está activa en Mi empresa. */
  readonly watermarked?: string;
}

/** Tipos de imagen que se aceptan al subir una foto o un plano. */
export const MEDIA_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Una foto de celular pesa entre 3 y 8 MB; más que esto no aporta a la web ni al PDF. */
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
/** Fotos, planos, videos y recorridos por propiedad o emprendimiento: los portales aceptan menos. */
export const MAX_MEDIA_PER_OWNER = 100;

export interface MediaItemSnapshot {
  readonly id: MediaItemId;
  readonly owner: MediaOwner;
  readonly kind: MediaKind;
  /** Original en el storage (fotos y planos). */
  readonly storageKey: string | undefined;
  /** Link externo (videos y recorridos 360). */
  readonly externalUrl: string | undefined;
  readonly contentType: string | undefined;
  readonly position: number;
  readonly isCover: boolean;
  readonly showOnWeb: boolean;
  readonly includeInPdf: boolean;
  readonly rotation: MediaRotation;
  readonly description: string | undefined;
  readonly width: number | undefined;
  readonly height: number | undefined;
  readonly sizeBytes: number | undefined;
  readonly variants: MediaVariants;
  readonly processing: MediaProcessingStatus;
  readonly processingError: string | undefined;
  readonly uploadedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UnsupportedMediaTypeError {
  readonly type: 'UnsupportedMediaType';
}
export interface MediaTooLargeError {
  readonly type: 'MediaTooLarge';
  readonly maxBytes: number;
}
export interface InvalidMediaUrlError {
  readonly type: 'InvalidMediaUrl';
}
/** Rotar, marcar como plano o generar variantes solo aplica a una imagen subida. */
export interface NotAnImageError {
  readonly type: 'NotAnImage';
}

interface MediaPayload {
  readonly ownerKind: MediaOwner['kind'];
  readonly ownerId: string;
  readonly mediaId: string;
}

/** Hay que generar las variantes (alta de una foto o rotación). Lo atiende un job (pg-boss). */
export type MediaVariantsRequested = DomainEvent<
  'properties.media_variants_requested',
  MediaPayload
>;
/** Se borró una foto: un job borra la original y sus variantes del storage. */
export type MediaDeleted = DomainEvent<
  'properties.media_deleted',
  MediaPayload & { readonly storageKeys: readonly string[] }
>;
/**
 * Cambió una foto, un plano o un link (alta, edición, orden, portada o variantes listas): la web
 * revalida la ficha de su dueño (ADR 0023).
 */
export type MediaChanged = DomainEvent<'properties.media_changed', MediaPayload>;
export type MediaEvent = MediaVariantsRequested | MediaDeleted | MediaChanged;

/** Proveedores de video y recorridos virtuales que se pueden embeber en la web. */
const VIDEO_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com'];
const TOUR_HOSTS = ['my.matterport.com', 'kuula.co', 'www.kuula.co', 'roundme.com'];

/**
 * Host de una URL `https://`, sin `URL` (el dominio no tiene DOM ni Node). Descarta el usuario
 * (`https://youtube.com@otro.com`) y corta en la barra invertida, que el navegador trata como `/`.
 */
const HTTPS_HOST = /^https:\/\/(?:[^@/?#\\]*@)?([^/?#:@\\]+)(?::\d+)?(?:[/?#\\]|$)/i;

function hostAllowed(url: string, hosts: readonly string[]): boolean {
  const host = HTTPS_HOST.exec(url)?.[1]?.toLowerCase();
  return host !== undefined && hosts.includes(host);
}

function isImage(kind: MediaKind): boolean {
  return kind === 'photo' || kind === 'floor_plan';
}

/**
 * Una foto, un plano, un video o un recorrido 360 de una propiedad o de un emprendimiento. La original se guarda tal cual;
 * las variantes optimizadas las genera un job, y mientras tanto queda "procesando".
 */
export class MediaItem extends AggregateRoot<MediaItemId, MediaEvent> {
  #state: Omit<MediaItemSnapshot, 'id'>;
  /** El estado guardado; `undefined` mientras es nuevo. Cada cambio reemplaza `#state`. */
  #saved: Omit<MediaItemSnapshot, 'id'> | undefined;

  private constructor(
    id: MediaItemId,
    state: Omit<MediaItemSnapshot, 'id'>,
    saved: 'stored' | 'new',
  ) {
    super(id);
    this.#state = state;
    this.#saved = saved === 'stored' ? state : undefined;
  }

  /** Valida tipo y tamaño antes de subir la original al storage. */
  static validateUpload(file: {
    readonly contentType: string;
    readonly sizeBytes: number;
  }): Result<void, UnsupportedMediaTypeError | MediaTooLargeError> {
    if (!MEDIA_IMAGE_TYPES.some((type) => type === file.contentType)) {
      return err({ type: 'UnsupportedMediaType' });
    }
    if (file.sizeBytes > MAX_MEDIA_BYTES) {
      return err({ type: 'MediaTooLarge', maxBytes: MAX_MEDIA_BYTES });
    }
    return ok(undefined);
  }

  static upload(input: {
    readonly id: MediaItemId;
    readonly owner: MediaOwner;
    readonly storageKey: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly position: number;
    /** La primera foto de la galería es la portada. */
    readonly isCover: boolean;
    readonly uploadedBy: string;
    readonly now: Date;
  }): Result<MediaItem, UnsupportedMediaTypeError | MediaTooLargeError> {
    const valid = MediaItem.validateUpload(input);
    if (valid.isErr()) return err(valid.error);
    const item = new MediaItem(
      input.id,
      {
        owner: input.owner,
        kind: 'photo',
        storageKey: input.storageKey,
        externalUrl: undefined,
        contentType: input.contentType,
        position: input.position,
        isCover: input.isCover,
        showOnWeb: true,
        includeInPdf: true,
        rotation: 0,
        description: undefined,
        width: undefined,
        height: undefined,
        sizeBytes: input.sizeBytes,
        variants: {},
        processing: 'pending',
        processingError: undefined,
        uploadedBy: input.uploadedBy,
        createdAt: input.now,
        updatedAt: input.now,
      },
      'new',
    );
    item.#requestVariants(input.now);
    return ok(item);
  }

  /** Un video (YouTube, Vimeo) o un recorrido 360 (Matterport, Kuula): solo el link. */
  static link(input: {
    readonly id: MediaItemId;
    readonly owner: MediaOwner;
    readonly kind: 'video' | 'tour_360';
    readonly url: string;
    readonly position: number;
    readonly uploadedBy: string;
    readonly now: Date;
  }): Result<MediaItem, InvalidMediaUrlError> {
    const url = input.url.trim();
    if (!hostAllowed(url, input.kind === 'video' ? VIDEO_HOSTS : TOUR_HOSTS)) {
      return err({ type: 'InvalidMediaUrl' });
    }
    return ok(
      new MediaItem(
        input.id,
        {
          owner: input.owner,
          kind: input.kind,
          storageKey: undefined,
          externalUrl: url,
          contentType: undefined,
          position: input.position,
          isCover: false,
          showOnWeb: true,
          includeInPdf: false,
          rotation: 0,
          description: undefined,
          width: undefined,
          height: undefined,
          sizeBytes: undefined,
          variants: {},
          processing: 'ready',
          processingError: undefined,
          uploadedBy: input.uploadedBy,
          createdAt: input.now,
          updatedAt: input.now,
        },
        'new',
      ),
    );
  }

  static restore(snapshot: MediaItemSnapshot): MediaItem {
    const { id, ...state } = snapshot;
    return new MediaItem(id, state, 'stored');
  }

  /**
   * Los eventos pendientes y, si cambió algo desde lo último guardado, `media_changed`: así
   * ningún cambio de la galería se olvida de avisarle a la web (ADR 0023).
   */
  override pullEvents(): readonly MediaEvent[] {
    const { updatedAt } = this.#state;
    if (this.#saved !== this.#state) {
      this.record({
        type: 'properties.media_changed',
        aggregateId: this.id,
        occurredAt: updatedAt,
        payload: this.#payload(),
      });
      this.#saved = this.#state;
    }
    return super.pullEvents();
  }

  get owner(): MediaOwner {
    return this.#state.owner;
  }

  get kind(): MediaKind {
    return this.#state.kind;
  }

  get isCover(): boolean {
    return this.#state.isCover;
  }

  get position(): number {
    return this.#state.position;
  }

  get storageKey(): string | undefined {
    return this.#state.storageKey;
  }

  /** Todo lo que hay en el storage: la original y las variantes. */
  get storageKeys(): readonly string[] {
    const { storageKey, variants } = this.#state;
    return [storageKey, variants.thumbnail, variants.web, variants.watermarked].filter(
      (key): key is string => key !== undefined,
    );
  }

  /**
   * Mostrar en la web, incluir en el PDF, es plano, descripción y rotación. Rotar vuelve a pedir
   * las variantes. Devuelve `false` si no cambió nada.
   */
  update(
    change: {
      readonly showOnWeb?: boolean;
      readonly includeInPdf?: boolean;
      readonly isFloorPlan?: boolean;
      readonly description?: string | undefined;
      readonly rotation?: MediaRotation;
    },
    now: Date,
  ): Result<boolean, NotAnImageError> {
    const image = isImage(this.#state.kind);
    if (!image && (change.isFloorPlan !== undefined || change.rotation !== undefined)) {
      return err({ type: 'NotAnImage' });
    }
    const description =
      change.description === undefined
        ? this.#state.description
        : change.description.trim() === ''
          ? undefined
          : change.description.trim();
    const kind: MediaKind =
      change.isFloorPlan === undefined
        ? this.#state.kind
        : change.isFloorPlan
          ? 'floor_plan'
          : 'photo';
    const next = {
      ...this.#state,
      showOnWeb: change.showOnWeb ?? this.#state.showOnWeb,
      includeInPdf: change.includeInPdf ?? this.#state.includeInPdf,
      kind,
      description,
      rotation: change.rotation ?? this.#state.rotation,
    };
    const changed =
      next.showOnWeb !== this.#state.showOnWeb ||
      next.includeInPdf !== this.#state.includeInPdf ||
      next.kind !== this.#state.kind ||
      next.description !== this.#state.description ||
      next.rotation !== this.#state.rotation;
    if (!changed) return ok(false);
    const rotated = next.rotation !== this.#state.rotation;
    this.#state = { ...next, updatedAt: now };
    if (rotated) {
      this.#state = { ...this.#state, processing: 'pending', processingError: undefined };
      this.#requestVariants(now);
    }
    return ok(true);
  }

  moveTo(position: number, now: Date): boolean {
    if (this.#state.position === position) return false;
    this.#state = { ...this.#state, position, updatedAt: now };
    return true;
  }

  /** Portada: solo una foto por galería. El caso de uso desmarca la anterior. */
  markCover(isCover: boolean, now: Date): Result<boolean, NotAnImageError> {
    if (isCover && this.#state.kind !== 'photo') return err({ type: 'NotAnImage' });
    if (this.#state.isCover === isCover) return ok(false);
    this.#state = { ...this.#state, isCover, updatedAt: now };
    return ok(true);
  }

  /** El job generó las variantes: quedan listas con las medidas de la original. */
  completeProcessing(
    result: {
      readonly variants: MediaVariants;
      readonly width: number;
      readonly height: number;
    },
    now: Date,
  ): Result<void, NotAnImageError> {
    if (!isImage(this.#state.kind)) return err({ type: 'NotAnImage' });
    this.#state = {
      ...this.#state,
      variants: result.variants,
      width: result.width,
      height: result.height,
      processing: 'ready',
      processingError: undefined,
      updatedAt: now,
    };
    return ok(undefined);
  }

  /** El job no pudo procesar la imagen (archivo dañado): queda la original y el motivo. */
  failProcessing(reason: string, now: Date): void {
    this.#state = {
      ...this.#state,
      processing: 'failed',
      processingError: reason.slice(0, 500),
      updatedAt: now,
    };
  }

  /** Se borra físicamente: el job limpia el storage. */
  delete(now: Date): void {
    this.record({
      type: 'properties.media_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: { ...this.#payload(), storageKeys: this.storageKeys },
    });
  }

  #requestVariants(now: Date): void {
    this.record({
      type: 'properties.media_variants_requested',
      aggregateId: this.id,
      occurredAt: now,
      payload: this.#payload(),
    });
  }

  #payload(): MediaPayload {
    const { owner } = this.#state;
    return { ownerKind: owner.kind, ownerId: owner.id, mediaId: this.id };
  }

  toSnapshot(): MediaItemSnapshot {
    return { id: this.id, ...this.#state };
  }
}
