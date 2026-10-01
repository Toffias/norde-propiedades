import { Email, parseId, type Clock, type Result } from '@norde/core/shared';
import {
  ADDRESS_DISPLAYS,
  CompanyFile,
  CompanySettings,
  DEFAULT_PDF_OPTIONS,
  DescriptionFooterTemplate,
  FileFolder,
  FileName,
  NEWS_SCOPES,
  REFERENCE_CODE_SCOPES,
  ReferenceCodePrefix,
  ReferenceCodeSequence,
  WATERMARK_POSITIONS,
  Watermark,
  WebUrlTemplate,
  type CompanyFileId,
  type CompanyFileRepository,
  type CompanySettingsReader,
  type CompanySettingsRepository,
  type FileFolderId,
  type FileFolderRepository,
  type ReferenceCodeScopeKey,
  type ReferenceCodeSequenceId,
  type ReferenceCodeSequenceRepository,
} from '@norde/core/settings';
import { and, count, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { companyFiles, companySettings, fileFolders, referenceCodeSequences } from '../db/schema';

/** Valores leídos de la base: si uno no es válido, la fila está corrupta. */
function stored<T, E>(result: Result<T, E>, what: string): T {
  if (result.isErr()) throw new Error(`Invalid ${what} stored in the database`);
  return result.value;
}

function storedId<TBrand extends string>(value: string) {
  return stored(parseId<TBrand>(value), 'id');
}

function optional<T>(value: string | null, create: (raw: string) => T): T | undefined {
  return value === null ? undefined : create(value);
}

const WatermarkSchema = z.object({
  enabled: z.boolean(),
  logoKey: z.string().optional(),
  sizePercent: z.number(),
  position: z.enum(WATERMARK_POSITIONS),
  opacity: z.number(),
});

// Las opciones que falten (agregadas después de guardar la fila) toman el valor de fábrica.
const PdfOptionsSchema = z.object({
  showCompanyContact: z.boolean().default(DEFAULT_PDF_OPTIONS.showCompanyContact),
  showAgent: z.boolean().default(DEFAULT_PDF_OPTIONS.showAgent),
  showPrice: z.boolean().default(DEFAULT_PDF_OPTIONS.showPrice),
  addressOnSend: z.enum(ADDRESS_DISPLAYS).default(DEFAULT_PDF_OPTIONS.addressOnSend),
  addressOnDownload: z.enum(ADDRESS_DISPLAYS).default(DEFAULT_PDF_OPTIONS.addressOnDownload),
  developmentPhotosInUnits: z.boolean().default(DEFAULT_PDF_OPTIONS.developmentPhotosInUnits),
});

const SINGLETON = eq(companySettings.id, true);

/** La fila única de `company_settings`. Lee y escribe dentro de la transacción que recibe. */
export class DrizzleCompanySettingsRepository
  implements CompanySettingsRepository, CompanySettingsReader
{
  constructor(
    private readonly db: DbExecutor,
    private readonly clock: Clock,
  ) {}

  async get(): Promise<CompanySettings> {
    const [row] = await this.db.select().from(companySettings).where(SINGLETON).limit(1);
    // La crea la migración: si falta, la base no está migrada.
    if (!row) throw new Error('The company_settings row is missing: run the migrations');

    const watermark = row.watermark === null ? undefined : WatermarkSchema.parse(row.watermark);
    const pdfOptions = PdfOptionsSchema.parse(row.pdfSettings ?? {});
    return CompanySettings.restore({
      name: row.name,
      logoKey: row.logoStorageKey ?? undefined,
      timezone: row.timezone,
      webPropertyUrlTemplate: optional(row.webPropertyUrlTemplate, (v) =>
        stored(WebUrlTemplate.create(v), 'url template'),
      ),
      webDevelopmentUrlTemplate: optional(row.webDevelopmentUrlTemplate, (v) =>
        stored(WebUrlTemplate.create(v), 'url template'),
      ),
      newsScope: z.enum(NEWS_SCOPES).parse(row.newsScope),
      watermark: watermark
        ? stored(
            Watermark.create({ ...watermark, logoKey: watermark.logoKey ?? undefined }),
            'watermark',
          )
        : Watermark.disabled(),
      portalDescriptionFooter: optional(row.portalDescriptionFooter, (v) =>
        stored(DescriptionFooterTemplate.create(v), 'footer'),
      ),
      pdfOptions,
      emailSender: {
        fromName: row.emailFromName ?? undefined,
        replyTo: optional(row.emailReplyTo, (v) => stored(Email.create(v), 'email')),
      },
    });
  }

  async save(settings: CompanySettings, actorId: string): Promise<void> {
    const s = settings.toSnapshot();
    await this.db
      .update(companySettings)
      .set({
        name: s.name,
        logoStorageKey: s.logoKey ?? null,
        timezone: s.timezone,
        webPropertyUrlTemplate: s.webPropertyUrlTemplate?.value ?? null,
        webDevelopmentUrlTemplate: s.webDevelopmentUrlTemplate?.value ?? null,
        newsScope: s.newsScope,
        watermark: s.watermark.toProps(),
        portalDescriptionFooter: s.portalDescriptionFooter?.value ?? null,
        pdfSettings: s.pdfOptions,
        emailFromName: s.emailSender.fromName ?? null,
        emailReplyTo: s.emailSender.replyTo?.value ?? null,
        updatedAt: this.clock.now(),
        updatedBy: actorId,
      })
      .where(SINGLETON);
  }
}

const ScopeSchema = z.enum(REFERENCE_CODE_SCOPES);

function toSequence(row: typeof referenceCodeSequences.$inferSelect): ReferenceCodeSequence {
  return ReferenceCodeSequence.restore({
    id: storedId<'ReferenceCodeSequence'>(row.id),
    scope: ScopeSchema.parse(row.scope),
    scopeValue: row.scopeValue,
    prefix: stored(ReferenceCodePrefix.create(row.prefix), 'prefix'),
    nextNumber: row.nextNumber,
  });
}

export class DrizzleReferenceCodeSequenceRepository implements ReferenceCodeSequenceRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly clock: Clock,
  ) {}

  async findById(id: ReferenceCodeSequenceId) {
    const [row] = await this.db
      .select()
      .from(referenceCodeSequences)
      .where(eq(referenceCodeSequences.id, id))
      .limit(1);
    return row && toSequence(row);
  }

  async findByScopes(keys: readonly ReferenceCodeScopeKey[]) {
    if (keys.length === 0) return [];
    const rows = await this.db
      .select()
      .from(referenceCodeSequences)
      .where(
        or(
          ...keys.map((k) =>
            and(
              eq(referenceCodeSequences.scope, k.scope),
              eq(referenceCodeSequences.scopeValue, k.scopeValue),
            ),
          ),
        ),
      )
      .limit(keys.length);
    return rows.map(toSequence);
  }

  async findByPrefix(prefix: ReferenceCodePrefix) {
    const [row] = await this.db
      .select()
      .from(referenceCodeSequences)
      .where(eq(referenceCodeSequences.prefix, prefix.value))
      .limit(1);
    return row && toSequence(row);
  }

  async save(sequence: ReferenceCodeSequence, actorId: string): Promise<void> {
    const s = sequence.toSnapshot();
    const now = this.clock.now();
    await this.db
      .insert(referenceCodeSequences)
      .values({
        id: s.id,
        scope: s.scope,
        scopeValue: s.scopeValue,
        prefix: s.prefix.value,
        nextNumber: s.nextNumber,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      })
      // El correlativo no se pisa: lo avanza solo `takeNextNumber`.
      .onConflictDoUpdate({
        target: referenceCodeSequences.id,
        set: { prefix: s.prefix.value, updatedAt: now, updatedBy: actorId },
      });
  }

  async delete(id: ReferenceCodeSequenceId): Promise<void> {
    await this.db.delete(referenceCodeSequences).where(eq(referenceCodeSequences.id, id));
  }

  async takeNextNumber(id: ReferenceCodeSequenceId): Promise<bigint> {
    // Un solo `update … returning`: Postgres bloquea la fila, así que dos transacciones
    // concurrentes nunca reciben el mismo número.
    const [row] = await this.db
      .update(referenceCodeSequences)
      .set({ nextNumber: sql`${referenceCodeSequences.nextNumber} + 1` })
      .where(eq(referenceCodeSequences.id, id))
      .returning({ taken: sql<string>`${referenceCodeSequences.nextNumber} - 1` });
    if (!row) throw new Error(`Reference code sequence ${id} not found`);
    return BigInt(row.taken);
  }
}

function toFolder(row: typeof fileFolders.$inferSelect): FileFolder {
  return FileFolder.restore({
    id: storedId<'FileFolder'>(row.id),
    parentId: row.parentId === null ? undefined : storedId<'FileFolder'>(row.parentId),
    name: stored(FileName.create(row.name), 'folder name'),
    path: row.path,
  });
}

export class DrizzleFileFolderRepository implements FileFolderRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly clock: Clock,
  ) {}

  async findById(id: FileFolderId) {
    const [row] = await this.db.select().from(fileFolders).where(eq(fileFolders.id, id)).limit(1);
    return row && toFolder(row);
  }

  async nameExists(parentId: FileFolderId | undefined, name: FileName, except?: FileFolderId) {
    const conditions: (SQL | undefined)[] = [
      parentId === undefined ? isNull(fileFolders.parentId) : eq(fileFolders.parentId, parentId),
      eq(fileFolders.name, name.value),
      except === undefined ? undefined : ne(fileFolders.id, except),
    ];
    const [row] = await this.db
      .select({ id: fileFolders.id })
      .from(fileFolders)
      .where(and(...conditions))
      .limit(1);
    return row !== undefined;
  }

  async contents(id: FileFolderId) {
    const [[folders], [files]] = await Promise.all([
      this.db.select({ total: count() }).from(fileFolders).where(eq(fileFolders.parentId, id)),
      // Incluye los de la papelera: la carpeta no se puede borrar mientras estén.
      this.db.select({ total: count() }).from(companyFiles).where(eq(companyFiles.folderId, id)),
    ]);
    return { folders: folders?.total ?? 0, files: files?.total ?? 0 };
  }

  async save(folder: FileFolder, actorId: string): Promise<void> {
    const s = folder.toSnapshot();
    const now = this.clock.now();
    await this.db
      .insert(fileFolders)
      .values({
        id: s.id,
        parentId: s.parentId ?? null,
        name: s.name.value,
        path: s.path,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        target: fileFolders.id,
        set: { name: s.name.value, updatedAt: now, updatedBy: actorId },
      });
  }

  async delete(id: FileFolderId): Promise<void> {
    await this.db.delete(fileFolders).where(eq(fileFolders.id, id));
  }
}

function toFile(row: typeof companyFiles.$inferSelect): CompanyFile {
  return CompanyFile.restore({
    id: storedId<'CompanyFile'>(row.id),
    folderId: row.folderId === null ? undefined : storedId<'FileFolder'>(row.folderId),
    name: stored(FileName.create(row.name), 'file name'),
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    deletedAt: row.deletedAt ?? undefined,
    deletedBy: row.deletedBy ?? undefined,
  });
}

export class DrizzleCompanyFileRepository implements CompanyFileRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly clock: Clock,
  ) {}

  async findById(id: CompanyFileId) {
    const [row] = await this.db.select().from(companyFiles).where(eq(companyFiles.id, id)).limit(1);
    return row && toFile(row);
  }

  async save(file: CompanyFile, actorId: string): Promise<void> {
    const s = file.toSnapshot();
    const now = this.clock.now();
    const changes = {
      name: s.name.value,
      deletedAt: s.deletedAt ?? null,
      deletedBy: s.deletedBy ?? null,
      updatedAt: now,
      updatedBy: actorId,
    };
    await this.db
      .insert(companyFiles)
      .values({
        id: s.id,
        folderId: s.folderId ?? null,
        storageKey: s.storageKey,
        mimeType: s.mimeType,
        sizeBytes: s.sizeBytes,
        uploadedBy: s.uploadedBy,
        createdAt: now,
        createdBy: actorId,
        ...changes,
      })
      .onConflictDoUpdate({ target: companyFiles.id, set: changes });
  }
}
