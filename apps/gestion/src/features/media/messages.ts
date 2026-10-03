import type {
  AddMediaLinkError,
  DeleteAttachmentError,
  DeleteMediaError,
  ListAttachmentsError,
  ListMediaError,
  ReorderMediaError,
  SetMediaCoverError,
  UpdateAttachmentError,
  UpdateMediaError,
  UploadAttachmentError,
  UploadMediaError,
} from '@norde/core/properties';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de la galería y los archivos (de una propiedad o un emprendimiento) → mensajes.

const MEGABYTE = 1024 * 1024;

const OWNER = {
  PropertyNotFound: 'No encontramos esa propiedad. Puede que la hayan borrado.',
  PropertyInTrash: 'La propiedad está en la papelera: restaurala para editarla.',
  DevelopmentNotFound: 'No encontramos ese emprendimiento. Puede que lo hayan borrado.',
  DevelopmentInTrash: 'El emprendimiento está en la papelera: restauralo para editarlo.',
} as const;

export type MediaError =
  | UploadMediaError
  | AddMediaLinkError
  | UpdateMediaError
  | ReorderMediaError
  | SetMediaCoverError
  | DeleteMediaError
  | UploadAttachmentError
  | UpdateAttachmentError
  | DeleteAttachmentError;

export const MEDIA_ERROR_MESSAGES = {
  ...OWNER,
  Forbidden: 'No tenés permiso para cambiar la multimedia de esta ficha.',
  InvalidInput: 'Revisá los datos y probá de nuevo.',
  UnsupportedMediaType: 'Subí fotos JPG, PNG o WebP.',
  MediaTooLarge: (error) =>
    `La foto pesa más de ${Math.round(error.maxBytes / MEGABYTE).toString()} MB.`,
  TooManyMedia: (error) => `La galería admite hasta ${error.max.toString()} ítems.`,
  InvalidMediaUrl:
    'Pegá un link de YouTube o Vimeo (videos) o de Matterport, Kuula o Roundme (recorridos).',
  NotAnImage: 'Eso solo se puede hacer con una foto.',
  MediaNotFound: 'Esa foto ya no está en la galería.',
  InvalidMediaOrder: 'La galería cambió mientras la ordenabas. Recargá la página y probá de nuevo.',
  UnsupportedAttachmentType: 'Subí PDF, imágenes, Word o Excel.',
  AttachmentTooLarge: (error) =>
    `El archivo pesa más de ${Math.round(error.maxBytes / MEGABYTE).toString()} MB.`,
  InvalidAttachmentName: 'El nombre del archivo no es válido (hasta 150 caracteres).',
  AttachmentNotFound: 'Ese archivo ya no está en la ficha.',
} satisfies ErrorMessages<MediaError>;

export const MEDIA_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver esta información.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  PropertyNotFound: OWNER.PropertyNotFound,
  DevelopmentNotFound: OWNER.DevelopmentNotFound,
} satisfies ErrorMessages<ListMediaError | ListAttachmentsError>;
