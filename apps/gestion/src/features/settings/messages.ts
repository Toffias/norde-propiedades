import type {
  ChangeCompanyLogoError,
  ChangeReferenceCodePrefixError,
  ChangeWatermarkLogoError,
  ConfigureWatermarkError,
  CreateFolderError,
  CreateReferenceCodeSequenceError,
  DeleteFolderError,
  DeleteReferenceCodeSequenceError,
  MoveCompanyFileToTrashError,
  PreviewWatermarkError,
  RenameCompanyFileError,
  RenameFolderError,
  RestoreCompanyFileError,
  SendTestEmailError,
  UpdateEmailSenderError,
  UpdateGeneralSettingsError,
  UpdatePdfOptionsError,
  UpdatePortalDescriptionFooterError,
  UploadCompanyFileError,
} from '@norde/core/settings';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de los casos de uso de Mi empresa → mensajes para la UI.

const FORBIDDEN_SETTINGS = 'Solo un administrador puede cambiar la configuración de la empresa.';
const INVALID = 'Revisá los datos marcados y probá de nuevo.';

type CompanySettingsError =
  | UpdateGeneralSettingsError
  | ChangeCompanyLogoError
  | ConfigureWatermarkError
  | ChangeWatermarkLogoError
  | PreviewWatermarkError
  | UpdatePortalDescriptionFooterError
  | UpdatePdfOptionsError
  | UpdateEmailSenderError
  | SendTestEmailError;

export const COMPANY_SETTINGS_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_SETTINGS,
  ValidationFailed: INVALID,
  InvalidCompanyName: 'El nombre de la empresa no puede quedar vacío.',
  InvalidTimezone: 'Elegí una zona horaria.',
  InvalidSenderName: 'El nombre del remitente es demasiado largo.',
  InvalidWebUrlTemplate: (error) =>
    `La URL de ${error.field === 'property' ? 'propiedades' : 'emprendimientos'} tiene que empezar con https:// y llevar {id} o {slug} una sola vez.`,
  InvalidWatermark: (error) =>
    error.reason === 'size'
      ? 'El tamaño de la marca de agua va de 5 % a 50 %.'
      : 'La opacidad va de 0 % a 100 %.',
  WatermarkLogoRequired: 'Primero subí el logo de la marca de agua.',
  InvalidImage: 'No pudimos leer la imagen. Probá con un JPG o PNG.',
  FooterTooLong: 'El pie puede tener hasta 1000 caracteres.',
  UnknownTemplateVariable: (error) =>
    `{${error.variable}} no es una variable disponible. Usá las de la lista.`,
  InvalidEmail: 'El email de respuesta no es válido.',
  MailNotConfigured:
    'El envío de emails todavía no está configurado en el servidor (falta la API key o el remitente).',
  MailRejected: (error) => `El proveedor de email rechazó el envío: ${error.reason}`,
  MailUnavailable: 'El proveedor de email no respondió. Probá de nuevo en unos minutos.',
} satisfies ErrorMessages<CompanySettingsError>;

type ReferenceCodeError =
  | CreateReferenceCodeSequenceError
  | ChangeReferenceCodePrefixError
  | DeleteReferenceCodeSequenceError;

export const REFERENCE_CODE_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_SETTINGS,
  ValidationFailed: INVALID,
  InvalidReferenceCodePrefix: 'El prefijo lleva de 1 a 6 letras o números, sin espacios.',
  InvalidScopeValue: 'Elegí a qué aplica el prefijo.',
  PrefixInUse: (error) => `El prefijo ${error.prefix} ya lo usa otra numeración.`,
  ScopeAlreadyConfigured: 'Ya hay un prefijo para eso. Editalo en lugar de crear otro.',
  GlobalSequenceRequired:
    'El prefijo general no se puede borrar: es el que se usa cuando no aplica ningún otro.',
  NotFound: 'No encontramos ese prefijo. Puede que lo hayan borrado.',
} satisfies ErrorMessages<ReferenceCodeError>;

type CompanyFilesError =
  | CreateFolderError
  | RenameFolderError
  | DeleteFolderError
  | UploadCompanyFileError
  | RenameCompanyFileError
  | MoveCompanyFileToTrashError
  | RestoreCompanyFileError;

export const COMPANY_FILES_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para hacer esto con los archivos de la empresa.',
  ValidationFailed: INVALID,
  InvalidFileName: 'El nombre no puede quedar vacío ni llevar barras.',
  FolderNameTaken: 'Ya hay una carpeta con ese nombre acá.',
  FolderNotEmpty:
    'La carpeta tiene archivos o subcarpetas: mandalos a la papelera antes de borrarla.',
  MaxFolderDepth: 'No se pueden anidar más carpetas acá.',
  FolderNotFound: 'No encontramos esa carpeta. Puede que la hayan borrado.',
  FileNotFound: 'No encontramos ese archivo. Puede que lo hayan borrado.',
  FileTooLarge: 'El archivo supera los 25 MB.',
  EmptyFile: 'El archivo está vacío.',
  FileTypeNotAllowed:
    'Ese tipo de archivo no se puede subir. Se aceptan PDF, documentos, planillas, imágenes y ZIP.',
  FileAlreadyInTrash: 'El archivo ya estaba en la papelera.',
  FileNotInTrash: 'El archivo ya no está en la papelera.',
} satisfies ErrorMessages<CompanyFilesError>;
