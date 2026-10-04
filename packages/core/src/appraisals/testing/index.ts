// Fakes del módulo appraisals para tests (`@norde/core/appraisals/testing`).

import { parseId, Actor } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type { AppraisalDetailItem, AppraisalQuery } from '../application/ports/appraisal-query';
import type {
  AppraisalCodeSequence,
  AppraisalsTransaction,
  AppraisalsUnitOfWork,
} from '../application/ports/appraisals-transaction';
import type { ActiveUsers, PanelDirectory } from '../application/ports/panel-directory';
import type {
  AppraisalReportContent,
  AppraisalReportRenderer,
} from '../application/ports/appraisal-report-renderer';
import { Appraisal, type AppraisalId, type AppraisalSnapshot } from '../domain/appraisal';
import type { AppraisalPhoto, AppraisalPhotoId } from '../domain/appraisal-photo';
import { EMPTY_APPRAISAL_RESULT } from '../domain/appraisal-result';
import type { AppraisalPhotoRepository, AppraisalRepository } from '../domain/appraisal.repository';

export const TEST_NOW = new Date('2026-10-01T12:00:00Z');
export const APPRAISAL_ID = '00000000-0000-7000-8000-0000000000d1';
export const REQUESTER_ID = '00000000-0000-7000-8000-0000000000c1';
export const OTHER_CLIENT_ID = '00000000-0000-7000-8000-0000000000c2';
export const PRODUCER_ID = '00000000-0000-7000-8000-0000000000a1';
export const APPRAISER_ID = '00000000-0000-7000-8000-0000000000a2';
export const OTHER_USER_ID = '00000000-0000-7000-8000-0000000000a3';
export const BRANCH_ID = '00000000-0000-7000-8000-0000000000b1';
export const OTHER_BRANCH_ID = '00000000-0000-7000-8000-0000000000b2';

/** Un productor: ve y cambia solo lo suyo. */
export const TEST_PRODUCER = Actor.user(PRODUCER_ID, [
  'appraisals:read',
  'appraisals:create',
  'appraisals:update',
  'appraisals:delete',
  'audit:read',
]).withBranch(BRANCH_ID);
/** El tasador asignado, sin "Ver tasaciones de otros". */
export const TEST_APPRAISER = Actor.user(APPRAISER_ID, [
  'appraisals:read',
  'appraisals:update',
]).withBranch(OTHER_BRANCH_ID);
/** Un agente sin relación con la tasación ni "Ver tasaciones de otros". */
export const TEST_OTHER_AGENT = Actor.user(OTHER_USER_ID, [
  'appraisals:read',
  'appraisals:update',
  'appraisals:delete',
  'audit:read',
]);
/** Gerencia: todas las tasaciones. */
export const TEST_MANAGER = Actor.user(OTHER_USER_ID, ['appraisals:*', 'audit:*']);
/** Sin permisos sobre tasaciones. */
export const TEST_OUTSIDER = Actor.user('00000000-0000-7000-8000-0000000000a9', ['clients:read']);

function unwrapId(raw: string): AppraisalId {
  const id = parseId<'Appraisal'>(raw);
  if (id.isErr()) throw new Error(`Invalid test id: ${raw}`);
  return id.value;
}

export function appraisalSnapshot(
  overrides: Partial<Omit<AppraisalSnapshot, 'id'>> & { readonly id?: string } = {},
): AppraisalSnapshot {
  const { id, ...rest } = overrides;
  return {
    id: unwrapId(id ?? APPRAISAL_ID),
    code: 'TAS0001',
    source: 'manual',
    status: 'requested',
    statusChangedAt: TEST_NOW,
    requesterClientId: REQUESTER_ID,
    producerUserId: PRODUCER_ID,
    branchId: BRANCH_ID,
    appraiserUserId: undefined,
    visitAt: undefined,
    propertyType: 'house',
    address: 'Mitre 1234',
    surfaceTotalM2: 300,
    surfaceCoveredM2: 180.5,
    rooms: 5,
    bedrooms: 3,
    bathrooms: 2,
    condition: 'good',
    result: EMPTY_APPRAISAL_RESULT,
    convertedPropertyId: undefined,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    deletedAt: undefined,
    deletedBy: undefined,
    ...rest,
  };
}

export class InMemoryAppraisalPhotoRepository implements AppraisalPhotoRepository {
  readonly rows = new Map<string, AppraisalPhoto>();

  listByAppraisal(appraisalId: AppraisalId) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((photo) => photo.appraisalId === appraisalId)
        .sort((a, b) => a.position - b.position),
    );
  }

  findById(id: AppraisalPhotoId) {
    return Promise.resolve(this.rows.get(id));
  }

  async count(appraisalId: AppraisalId) {
    return (await this.listByAppraisal(appraisalId)).length;
  }

  async nextPosition(appraisalId: AppraisalId) {
    const photos = await this.listByAppraisal(appraisalId);
    return Math.max(-1, ...photos.map((photo) => photo.position)) + 1;
  }

  insert(photo: AppraisalPhoto) {
    this.rows.set(photo.id, photo);
    return Promise.resolve();
  }

  delete(id: AppraisalPhotoId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryAppraisalRepository implements AppraisalRepository {
  readonly rows = new Map<string, AppraisalSnapshot>();
  readonly savedBy = new Map<string, string>();

  /** Las fotos se borran con su tasación (en la base, por cascada). */
  constructor(private readonly photos = new InMemoryAppraisalPhotoRepository()) {}

  findById(id: AppraisalId) {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? undefined : Appraisal.restore(row));
  }

  insert(appraisal: Appraisal, actorId: string) {
    this.rows.set(appraisal.id, appraisal.toSnapshot());
    this.savedBy.set(appraisal.id, actorId);
    return Promise.resolve();
  }

  save(appraisal: Appraisal, actorId: string) {
    this.rows.set(appraisal.id, appraisal.toSnapshot());
    this.savedBy.set(appraisal.id, actorId);
    return Promise.resolve();
  }

  moveRequester(fromClientId: string, toClientId: string) {
    const moved: AppraisalId[] = [];
    for (const [id, row] of this.rows) {
      if (row.requesterClientId !== fromClientId) continue;
      this.rows.set(id, { ...row, requesterClientId: toClientId });
      moved.push(row.id);
    }
    return Promise.resolve(moved);
  }

  deleteByRequesters(clientIds: readonly string[], limit: number) {
    let deleted = 0;
    const photoKeys: string[] = [];
    for (const [id, row] of this.rows) {
      if (deleted >= limit) break;
      if (!clientIds.includes(row.requesterClientId)) continue;
      for (const [photoId, photo] of this.photos.rows) {
        if (photo.appraisalId !== id) continue;
        photoKeys.push(photo.storageKey);
        this.photos.rows.delete(photoId);
      }
      this.rows.delete(id);
      deleted += 1;
    }
    return Promise.resolve({ deleted, photoKeys });
  }
}

export class InMemoryAppraisalCodeSequence implements AppraisalCodeSequence {
  last = 0;

  next() {
    this.last += 1;
    return Promise.resolve(this.last);
  }
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

export class InMemoryAppraisalsUnitOfWork implements AppraisalsUnitOfWork, AppraisalsTransaction {
  readonly photos = new InMemoryAppraisalPhotoRepository();
  readonly appraisals = new InMemoryAppraisalRepository(this.photos);
  readonly codes = new InMemoryAppraisalCodeSequence();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: AppraisalsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      rows: new Map(this.appraisals.rows),
      photos: new Map(this.photos.rows),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const rollback = () => {
      this.appraisals.rows.clear();
      for (const [k, v] of backup.rows) this.appraisals.rows.set(k, v);
      this.photos.rows.clear();
      for (const [k, v] of backup.photos) this.photos.rows.set(k, v);
      this.events.published.splice(backup.events);
      this.audit.entries.splice(backup.audit);
    };
    try {
      const result = await work(this);
      if (isErrResult(result)) rollback();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
}

/** Usuarios activos con su sucursal. */
export class InMemoryActiveUsers implements ActiveUsers {
  constructor(
    private readonly users: ReadonlyMap<
      string,
      { readonly branchId: string | undefined }
    > = new Map(),
  ) {}

  find(userId: string) {
    return Promise.resolve(this.users.get(userId));
  }
}

/** Nombres de usuarios y sucursales. */
export class InMemoryPanelDirectory implements PanelDirectory {
  constructor(
    private readonly entries: {
      readonly user?: ReadonlyMap<string, string>;
      readonly branch?: ReadonlyMap<string, string>;
    } = {},
  ) {}

  names(kind: 'user' | 'branch', ids: readonly string[]) {
    const source = this.entries[kind] ?? new Map<string, string>();
    const found = new Map<string, string>();
    for (const id of ids) {
      const name = source.get(id);
      if (name !== undefined) found.set(id, name);
    }
    return Promise.resolve(found);
  }
}

/** La ficha de una tasación como la leería la base, a partir de su snapshot. */
export function appraisalDetailItem(
  snapshot: AppraisalSnapshot,
  requesterName: string | undefined = 'Ana Pérez',
  photoIds: readonly string[] = [],
): AppraisalDetailItem {
  const { sale, rent, comparables, observations } = snapshot.result;
  return {
    result: {
      sale,
      rent,
      observations,
      comparables: comparables.map((comparable) => ({
        address: comparable.address,
        price: { amountCents: comparable.priceCents, currency: comparable.currency },
        surfaceM2: comparable.surfaceM2,
        url: comparable.url,
        note: comparable.note,
      })),
    },
    photoIds,
    convertedProperty:
      snapshot.convertedPropertyId === undefined
        ? undefined
        : { id: snapshot.convertedPropertyId, code: undefined },
    id: snapshot.id,
    code: snapshot.code,
    status: snapshot.status,
    propertyType: snapshot.propertyType,
    address: snapshot.address,
    requesterClientId: snapshot.requesterClientId,
    requesterName,
    producerUserId: snapshot.producerUserId,
    appraiserUserId: snapshot.appraiserUserId,
    branchId: snapshot.branchId,
    visitAt: snapshot.visitAt,
    createdAt: snapshot.createdAt,
    deletedAt: snapshot.deletedAt,
    source: snapshot.source,
    surfaceTotalM2: snapshot.surfaceTotalM2,
    surfaceCoveredM2: snapshot.surfaceCoveredM2,
    rooms: snapshot.rooms,
    bedrooms: snapshot.bedrooms,
    bathrooms: snapshot.bathrooms,
    condition: snapshot.condition,
    statusChangedAt: snapshot.statusChangedAt,
    updatedAt: snapshot.updatedAt,
  };
}

/** Lecturas: devuelve las filas cargadas (sin filtrar) y registra lo pedido. */
export class StubAppraisalQuery implements AppraisalQuery {
  readonly requests: Parameters<AppraisalQuery['search']>[0][] = [];

  constructor(private readonly rows: readonly AppraisalDetailItem[] = []) {}

  search(query: Parameters<AppraisalQuery['search']>[0]) {
    this.requests.push(query);
    return Promise.resolve({
      items: this.rows.slice(query.offset, query.offset + query.limit),
      total: this.rows.length,
    });
  }

  findDetail(appraisalId: string) {
    return Promise.resolve(this.rows.find((row) => row.id === appraisalId));
  }
}

/** Guarda lo que recibe (con las fotos ya leídas) y devuelve un PDF de mentira. */
export class RecordingAppraisalReportRenderer implements AppraisalReportRenderer {
  readonly rendered: (Omit<AppraisalReportContent, 'photos'> & {
    readonly photos: readonly Uint8Array[];
  })[] = [];

  async render(content: AppraisalReportContent): Promise<Uint8Array> {
    const photos: Uint8Array[] = [];
    for await (const photo of content.photos) photos.push(photo);
    this.rendered.push({ ...content, photos });
    return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  }
}
