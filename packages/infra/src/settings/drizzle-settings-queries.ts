import {
  REFERENCE_CODE_SCOPES,
  type CompanyFilesQuery,
  type Directory,
  type DirectoryEntry,
  type DirectoryScope,
  type FolderCrumb,
  type FolderEntry,
  type ReferenceCodeSequenceQuery,
  type ReferenceCodeUsage,
  type TrashedFileRow,
} from '@norde/core/settings';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  branches,
  companyFiles,
  developments,
  fileFolders,
  properties,
  referenceCodeSequences,
  teams,
  users,
} from '../db/schema';

type Direction = 'asc' | 'desc';

function by(direction: Direction, expression: SQL | Parameters<typeof asc>[0]): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

const ScopeSchema = z.enum(REFERENCE_CODE_SCOPES);

export class DrizzleReferenceCodeSequenceQuery implements ReferenceCodeSequenceQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(params: {
    readonly offset: number;
    readonly limit: number;
    readonly sort: { readonly field: 'scope' | 'prefix'; readonly direction: Direction };
  }) {
    const t = referenceCodeSequences;
    const order =
      params.sort.field === 'prefix'
        ? [by(params.sort.direction, t.prefix)]
        : [by(params.sort.direction, t.scope), by(params.sort.direction, t.scopeValue)];
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(t)
        .orderBy(...order, asc(t.id))
        .limit(params.limit)
        .offset(params.offset),
      this.db.select({ total: count() }).from(t),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        scope: ScopeSchema.parse(row.scope),
        scopeValue: row.scopeValue,
        prefix: row.prefix,
        nextNumber: row.nextNumber,
      })),
      total: totals[0]?.total ?? 0,
    };
  }
}

/** Si el código ya lo usa una propiedad o un emprendimiento. Consulta de solo lectura. */
export class DrizzleReferenceCodeUsage implements ReferenceCodeUsage {
  constructor(private readonly db: DbExecutor) {}

  async isTaken(code: string): Promise<boolean> {
    const result = await this.db.execute<{ taken: boolean }>(sql`
      select exists (select 1 from ${properties} where ${properties.code} = ${code})
          or exists (select 1 from ${developments} where ${developments.code} = ${code}) as taken
    `);
    return result.rows[0]?.taken === true;
  }
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Usuarios, equipos y sucursales por nombre. Las tablas son de identity y chicas (una inmobiliaria);
 * la búsqueda usa `core.search_normalize`, sin acentos.
 */
export class DrizzleDirectory implements Directory {
  constructor(private readonly db: DbExecutor) {}

  async search(params: {
    readonly kind: DirectoryScope;
    readonly search: string | undefined;
    readonly offset: number;
    readonly limit: number;
    readonly direction: Direction;
  }): Promise<PageSlice<DirectoryEntry>> {
    const { table, where } = this.source(params.kind);
    const term =
      params.search === undefined
        ? undefined
        : sql`core.search_normalize(${table.name}) like '%' || core.search_normalize(${escapeLike(params.search)}) || '%'`;
    const condition = and(where, term);
    const [rows, totals] = await Promise.all([
      this.db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(condition)
        .orderBy(by(params.direction, table.name), asc(table.id))
        .limit(params.limit)
        .offset(params.offset),
      this.db.select({ total: count() }).from(table).where(condition),
    ]);
    return { items: rows, total: totals[0]?.total ?? 0 };
  }

  async names(kind: DirectoryScope, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const valid = ids.filter((id) => z.uuid().safeParse(id).success);
    if (valid.length === 0) return new Map();
    const { table } = this.source(kind);
    const rows = await this.db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(inArray(table.id, valid))
      .limit(valid.length);
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private source(kind: DirectoryScope) {
    switch (kind) {
      case 'user':
        return { table: users, where: eq(users.status, 'active') };
      case 'team':
        return { table: teams, where: undefined };
      case 'branch':
        return { table: branches, where: isNull(branches.deletedAt) };
    }
  }
}

const notDeletedFile = isNull(companyFiles.deletedAt);

export class DrizzleCompanyFilesQuery implements CompanyFilesQuery {
  constructor(private readonly db: DbExecutor) {}

  async listFolder(params: {
    readonly folderId: string | undefined;
    readonly offset: number;
    readonly limit: number;
    readonly sort: { readonly field: 'name' | 'updatedAt' | 'size'; readonly direction: Direction };
  }): Promise<PageSlice<FolderEntry>> {
    const inFolder =
      params.folderId === undefined
        ? isNull(fileFolders.parentId)
        : eq(fileFolders.parentId, params.folderId);
    const fileInFolder = and(
      params.folderId === undefined
        ? isNull(companyFiles.folderId)
        : eq(companyFiles.folderId, params.folderId),
      notDeletedFile,
    );

    // Subcarpetas primero y después archivos; dentro de cada grupo, el orden pedido. Las carpetas
    // no tienen tamaño: ese orden las deja por nombre.
    const column =
      params.sort.field === 'name'
        ? sql`name`
        : params.sort.field === 'updatedAt'
          ? sql`updated_at`
          : sql`size_bytes`;
    const direction = params.sort.direction === 'asc' ? sql`asc` : sql`desc`;
    const rows = await this.db.execute<{
      kind: 'folder' | 'file';
      id: string;
      name: string;
      mime_type: string | null;
      size_bytes: string | null;
      updated_at: Date | string;
    }>(sql`
      select * from (
        select 'folder' as kind, 0 as kind_order, ${fileFolders.id} as id, ${fileFolders.name} as name,
               null::text as mime_type, null::bigint as size_bytes, ${fileFolders.updatedAt} as updated_at
        from ${fileFolders} where ${inFolder}
        union all
        select 'file', 1, ${companyFiles.id}, ${companyFiles.name}, ${companyFiles.mimeType},
               ${companyFiles.sizeBytes}, ${companyFiles.updatedAt}
        from ${companyFiles} where ${fileInFolder}
      ) entries
      order by kind_order, ${column} ${direction} nulls last, name asc, id asc
      limit ${params.limit} offset ${params.offset}
    `);
    const [[folders], [files]] = await Promise.all([
      this.db.select({ total: count() }).from(fileFolders).where(inFolder),
      this.db.select({ total: count() }).from(companyFiles).where(fileInFolder),
    ]);

    return {
      items: rows.rows.map((row): FolderEntry => {
        const updatedAt = new Date(row.updated_at);
        return row.kind === 'folder'
          ? { kind: 'folder', id: row.id, name: row.name, updatedAt }
          : {
              kind: 'file',
              id: row.id,
              name: row.name,
              mimeType: row.mime_type ?? 'application/octet-stream',
              sizeBytes: Number(row.size_bytes ?? 0),
              updatedAt,
            };
      }),
      total: (folders?.total ?? 0) + (files?.total ?? 0),
    };
  }

  async listTrash(params: {
    readonly offset: number;
    readonly limit: number;
    readonly sort: { readonly field: 'deletedAt' | 'name'; readonly direction: Direction };
  }): Promise<PageSlice<TrashedFileRow>> {
    const inTrash = isNotNull(companyFiles.deletedAt);
    const column = params.sort.field === 'name' ? companyFiles.name : companyFiles.deletedAt;
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(companyFiles)
        .where(inTrash)
        .orderBy(by(params.sort.direction, column), asc(companyFiles.id))
        .limit(params.limit)
        .offset(params.offset),
      this.db.select({ total: count() }).from(companyFiles).where(inTrash),
    ]);
    return {
      items: rows.flatMap((row) =>
        row.deletedAt && row.deletedBy
          ? [
              {
                id: row.id,
                name: row.name,
                folderId: row.folderId ?? undefined,
                mimeType: row.mimeType,
                sizeBytes: row.sizeBytes,
                deletedAt: row.deletedAt,
                deletedBy: row.deletedBy,
              },
            ]
          : [],
      ),
      total: totals[0]?.total ?? 0,
    };
  }

  async breadcrumb(folderId: string): Promise<FolderCrumb[]> {
    if (!z.uuid().safeParse(folderId).success) return [];
    const [folder] = await this.db
      .select({ path: fileFolders.path })
      .from(fileFolders)
      .where(eq(fileFolders.id, folderId))
      .limit(1);
    if (!folder) return [];
    const ids = folder.path.split('/').filter((segment) => segment !== '');
    const rows = await this.db
      .select({ id: fileFolders.id, name: fileFolders.name })
      .from(fileFolders)
      .where(inArray(fileFolders.id, ids))
      .limit(ids.length);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }
}
