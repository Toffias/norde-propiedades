import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  text,
  type AnyPgColumn,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { NIL_UUID, authorship, notDeleted, singletonId, timestamps, trash } from './columns';
import { coreSchema } from './core-schema';

/** Configuración general de la empresa (fila única). */
export const companySettings = coreSchema.table(
  'company_settings',
  {
    ...singletonId(),
    name: text('name').notNull().default('Norde Propiedades'),
    logoUrl: text('logo_url'),
    timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
    /** Plantilla de la URL de una propiedad en la web (ej. `https://norde.com.ar/propiedades/{slug}`). */
    webPropertyUrlTemplate: text('web_property_url_template'),
    webDevelopmentUrlTemplate: text('web_development_url_template'),
    /** Qué ve cada usuario en Noticias: `branch` / `all`. */
    newsScope: text('news_scope').notNull().default('all'),
    /** Marca de agua de las fotos: logo, tamaño, posición, opacidad. */
    watermark: jsonb('watermark'),
    portalDescriptionFooter: text('portal_description_footer'),
    pdfSettings: jsonb('pdf_settings'),
    emailFromName: text('email_from_name'),
    emailReplyTo: text('email_reply_to'),
    ...timestamps(),
    ...authorship(),
  },
  () => [check('company_settings_singleton', sql`id`)],
);

/**
 * Numeración de los códigos de referencia (`P-001`). El número se toma con
 * `update … set next_number = next_number + 1 returning`, dentro de la transacción del alta.
 */
export const referenceCodeSequences = coreSchema.table(
  'reference_code_sequences',
  {
    id: uuid('id').primaryKey(),
    /** `global` / `property_type` / `user` / `team` / `branch`. */
    scope: text('scope').notNull(),
    /** Valor del alcance (tipo de propiedad o ID); `''` para `global`. */
    scopeValue: text('scope_value').notNull().default(''),
    prefix: text('prefix').notNull(),
    nextNumber: bigint('next_number', { mode: 'bigint' })
      .notNull()
      .default(sql`1`),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [uniqueIndex('reference_code_sequences_scope_uq').on(t.scope, t.scopeValue)],
);

/** Carpetas de los archivos de la empresa. */
export const fileFolders = coreSchema.table(
  'file_folders',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => fileFolders.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    /** Ruta materializada (`/contratos/modelos`), para listar un subárbol. */
    path: text('path').notNull(),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('file_folders_parent_name_uq').on(
      sql`coalesce(${t.parentId}, ${NIL_UUID})`,
      t.name,
    ),
    index('file_folders_path_idx').on(t.path.op('text_pattern_ops')),
  ],
);

export const companyFiles = coreSchema.table(
  'company_files',
  {
    id: uuid('id').primaryKey(),
    folderId: uuid('folder_id').references(() => fileFolders.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    uploadedBy: text('uploaded_by').notNull(),
    ...timestamps(),
    ...authorship(),
    ...trash(),
  },
  (t) => [index('company_files_folder_name_idx').on(t.folderId, t.name).where(notDeleted)],
);
