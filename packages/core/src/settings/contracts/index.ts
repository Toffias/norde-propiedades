// Contracts del módulo settings (`@norde/core/settings/contracts`): importables desde el cliente.
// Los valores de los enums replican los del dominio (un test verifica que coincidan).

import { z } from 'zod';

import { PROPERTY_TYPES } from '../../properties/contracts';
import { pageQuerySchema } from '../../shared/contracts';

export const NEWS_SCOPE_VALUES = ['branch', 'all'] as const;
export const WATERMARK_POSITION_VALUES = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export const ADDRESS_DISPLAY_VALUES = ['full', 'approximate', 'hidden'] as const;
export const FOOTER_VARIABLE_VALUES = [
  'codigo',
  'telefono_sucursal',
  'email_sucursal',
  'whatsapp_sucursal',
  'url_web',
] as const;
export const REFERENCE_CODE_SCOPE_VALUES = [
  'user',
  'team',
  'branch',
  'property_type',
  'global',
] as const;
/** Alcances que se eligen con un buscador (el resto es la global o un tipo de propiedad). */
export const DIRECTORY_SCOPE_VALUES = ['user', 'team', 'branch'] as const;

export type NewsScopeValue = (typeof NEWS_SCOPE_VALUES)[number];
export type WatermarkPositionValue = (typeof WATERMARK_POSITION_VALUES)[number];
export type AddressDisplayValue = (typeof ADDRESS_DISPLAY_VALUES)[number];
export type ReferenceCodeScopeValue = (typeof REFERENCE_CODE_SCOPE_VALUES)[number];
export type DirectoryScope = (typeof DIRECTORY_SCOPE_VALUES)[number];

/** Imágenes aceptadas como logo de la empresa o de la marca de agua. */
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** Foto de muestra para la vista previa de la marca de agua. */
export const MAX_PREVIEW_IMAGE_BYTES = 10 * 1024 * 1024;
/** Igual que `MAX_COMPANY_FILE_BYTES` del dominio: el formulario avisa antes de subir. */
export const MAX_COMPANY_FILE_UPLOAD_BYTES = 25 * 1024 * 1024;

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('es-AR', { timeZone: value });
    return true;
  } catch {
    // Intl lanza RangeError ante una zona horaria desconocida: no es un error, es un dato inválido.
    return false;
  }
}

const optionalText = (max: number) => z.string().trim().max(max).optional();

const bytesSchema = (max: number) =>
  z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.byteLength > 0, { message: 'El archivo está vacío' })
    .refine((bytes) => bytes.byteLength <= max, { message: 'El archivo es demasiado grande' });

export const ImageUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(LOGO_CONTENT_TYPES),
  bytes: bytesSchema(MAX_LOGO_BYTES),
});
export type ImageUpload = z.input<typeof ImageUploadSchema>;

// ---------- Configuración general ----------

export const UpdateGeneralSettingsInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64).refine(isTimezone, {
    message: 'Zona horaria desconocida',
  }),
  webPropertyUrlTemplate: optionalText(300),
  webDevelopmentUrlTemplate: optionalText(300),
  newsScope: z.enum(NEWS_SCOPE_VALUES),
});
export type UpdateGeneralSettingsInput = z.input<typeof UpdateGeneralSettingsInputSchema>;

/** Sin `image`, se quita el logo. */
export const ChangeLogoInputSchema = z.object({ image: ImageUploadSchema.optional() });
export type ChangeLogoInput = z.input<typeof ChangeLogoInputSchema>;

export const WatermarkOptionsSchema = z.object({
  enabled: z.boolean(),
  sizePercent: z.coerce.number().int().min(5).max(50),
  position: z.enum(WATERMARK_POSITION_VALUES),
  opacity: z.coerce.number().int().min(0).max(100),
});
export type WatermarkOptions = z.input<typeof WatermarkOptionsSchema>;

export const ConfigureWatermarkInputSchema = WatermarkOptionsSchema;
export type ConfigureWatermarkInput = z.input<typeof ConfigureWatermarkInputSchema>;

export const PreviewWatermarkInputSchema = z.object({
  photo: z.object({
    contentType: z.enum(LOGO_CONTENT_TYPES),
    bytes: bytesSchema(MAX_PREVIEW_IMAGE_BYTES),
  }),
  options: WatermarkOptionsSchema,
});
export type PreviewWatermarkInput = z.input<typeof PreviewWatermarkInputSchema>;

export const UpdatePortalDescriptionFooterInputSchema = z.object({
  footer: optionalText(1000),
});
export type UpdatePortalDescriptionFooterInput = z.input<
  typeof UpdatePortalDescriptionFooterInputSchema
>;

export const UpdatePdfOptionsInputSchema = z.object({
  showCompanyContact: z.boolean(),
  showAgent: z.boolean(),
  showPrice: z.boolean(),
  addressOnSend: z.enum(ADDRESS_DISPLAY_VALUES),
  addressOnDownload: z.enum(ADDRESS_DISPLAY_VALUES),
  developmentPhotosInUnits: z.boolean(),
});
export type UpdatePdfOptionsInput = z.input<typeof UpdatePdfOptionsInputSchema>;

export const UpdateEmailSenderInputSchema = z.object({
  fromName: optionalText(120),
  replyTo: z.email().max(254).optional(),
});
export type UpdateEmailSenderInput = z.input<typeof UpdateEmailSenderInputSchema>;

export const SendTestEmailInputSchema = z.object({ to: z.email().max(254) });
export type SendTestEmailInput = z.input<typeof SendTestEmailInputSchema>;

export interface CompanySettingsView {
  readonly name: string;
  readonly hasLogo: boolean;
  readonly timezone: string;
  readonly webPropertyUrlTemplate: string | undefined;
  readonly webDevelopmentUrlTemplate: string | undefined;
  readonly newsScope: NewsScopeValue;
  readonly watermark: {
    readonly enabled: boolean;
    readonly hasLogo: boolean;
    readonly sizePercent: number;
    readonly position: WatermarkPositionValue;
    readonly opacity: number;
  };
  readonly portalDescriptionFooter: string | undefined;
  readonly pdfOptions: UpdatePdfOptionsInput;
  readonly emailSender: {
    readonly fromName: string | undefined;
    readonly replyTo: string | undefined;
  };
}

/** Un archivo leído del storage, para devolverlo en una descarga o una vista previa. */
export interface FileContent {
  readonly fileName: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

// ---------- Códigos de referencia ----------

export const ListReferenceCodeSequencesQuerySchema = pageQuerySchema({
  sortable: ['scope', 'prefix'],
  defaultSort: { field: 'scope', direction: 'asc' },
});
export type ListReferenceCodeSequencesQuery = z.input<typeof ListReferenceCodeSequencesQuerySchema>;

const prefixSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,6}$/, { message: 'De 1 a 6 letras o números, sin espacios' });

export const CreateReferenceCodeSequenceInputSchema = z
  .object({
    scope: z.enum(REFERENCE_CODE_SCOPE_VALUES),
    /** ID del usuario, equipo o sucursal, o el tipo de propiedad. Vacío para la global. */
    scopeValue: z.string().trim().max(60).default(''),
    prefix: prefixSchema,
  })
  .superRefine((input, context) => {
    const valid =
      input.scope === 'global'
        ? input.scopeValue === ''
        : input.scope === 'property_type'
          ? PROPERTY_TYPES.some((type) => type === input.scopeValue)
          : z.uuid().safeParse(input.scopeValue).success;
    if (!valid) {
      context.addIssue({ code: 'custom', path: ['scopeValue'], message: 'Elegí a qué aplica' });
    }
  });
export type CreateReferenceCodeSequenceInput = z.input<
  typeof CreateReferenceCodeSequenceInputSchema
>;

export const ChangeReferenceCodePrefixInputSchema = z.object({
  sequenceId: z.uuid(),
  prefix: prefixSchema,
});
export type ChangeReferenceCodePrefixInput = z.input<typeof ChangeReferenceCodePrefixInputSchema>;

export const DeleteReferenceCodeSequenceInputSchema = z.object({ sequenceId: z.uuid() });
export type DeleteReferenceCodeSequenceInput = z.input<
  typeof DeleteReferenceCodeSequenceInputSchema
>;

export const ALLOCATION_TARGET_VALUES = ['property', 'development'] as const;

export const AllocateReferenceCodeInputSchema = z.object({
  target: z.enum(ALLOCATION_TARGET_VALUES),
  userId: z.uuid().optional(),
  teamIds: z.array(z.uuid()).max(20).optional(),
  branchId: z.uuid().optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
});
export type AllocateReferenceCodeInput = z.input<typeof AllocateReferenceCodeInputSchema>;

export interface AllocateReferenceCodeOutput {
  readonly code: string;
  readonly sequenceId: string;
}

export interface ReferenceCodeSequenceRow {
  readonly id: string;
  readonly scope: ReferenceCodeScopeValue;
  readonly scopeValue: string;
  /** Nombre del usuario, equipo o sucursal, si el alcance es uno de esos. */
  readonly scopeName: string | undefined;
  readonly prefix: string;
  /** El próximo código que va a entregar la numeración (`CAS0013`). */
  readonly nextCode: string;
}

export const SearchDirectoryQuerySchema = pageQuerySchema({
  sortable: ['name'],
  defaultSort: { field: 'name', direction: 'asc' },
}).extend({
  kind: z.enum(DIRECTORY_SCOPE_VALUES),
  search: optionalText(100),
});
export type SearchDirectoryQuery = z.input<typeof SearchDirectoryQuerySchema>;

export interface DirectoryEntry {
  readonly id: string;
  readonly name: string;
}

// ---------- Gestor de archivos ----------

export const ListFolderContentsQuerySchema = pageQuerySchema({
  sortable: ['name', 'updatedAt', 'size'],
  defaultSort: { field: 'name', direction: 'asc' },
}).extend({
  /** Sin carpeta, la raíz. */
  folderId: z.uuid().optional(),
});
export type ListFolderContentsQuery = z.input<typeof ListFolderContentsQuerySchema>;

export const ListTrashedFilesQuerySchema = pageQuerySchema({
  sortable: ['deletedAt', 'name'],
  defaultSort: { field: 'deletedAt', direction: 'desc' },
});
export type ListTrashedFilesQuery = z.input<typeof ListTrashedFilesQuerySchema>;

const fileNameSchema = z.string().trim().min(1).max(120);

export const CreateFolderInputSchema = z.object({
  parentId: z.uuid().optional(),
  name: fileNameSchema,
});
export type CreateFolderInput = z.input<typeof CreateFolderInputSchema>;

export const RenameFolderInputSchema = z.object({ folderId: z.uuid(), name: fileNameSchema });
export type RenameFolderInput = z.input<typeof RenameFolderInputSchema>;

export const FolderIdInputSchema = z.object({ folderId: z.uuid() });
export type FolderIdInput = z.input<typeof FolderIdInputSchema>;

export const UploadCompanyFileInputSchema = z.object({
  folderId: z.uuid().optional(),
  fileName: fileNameSchema,
  contentType: z.string().trim().min(1).max(200),
  bytes: bytesSchema(MAX_COMPANY_FILE_UPLOAD_BYTES),
});
export type UploadCompanyFileInput = z.input<typeof UploadCompanyFileInputSchema>;

export const RenameCompanyFileInputSchema = z.object({ fileId: z.uuid(), name: fileNameSchema });
export type RenameCompanyFileInput = z.input<typeof RenameCompanyFileInputSchema>;

export const FileIdInputSchema = z.object({ fileId: z.uuid() });
export type FileIdInput = z.input<typeof FileIdInputSchema>;

export type FolderEntry =
  | {
      readonly kind: 'folder';
      readonly id: string;
      readonly name: string;
      readonly updatedAt: Date;
    }
  | {
      readonly kind: 'file';
      readonly id: string;
      readonly name: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
      readonly updatedAt: Date;
    };

export interface TrashedFileRow {
  readonly id: string;
  readonly name: string;
  readonly folderId: string | undefined;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly deletedAt: Date;
  /** Usuario que lo borró (ID). */
  readonly deletedBy: string;
}

export interface FolderCrumb {
  readonly id: string;
  readonly name: string;
}
