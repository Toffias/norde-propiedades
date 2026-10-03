import {
  Coordinates,
  Development,
  MediaItem,
  Property,
  Attachment,
  type MediaItemId,
  type MediaOwner,
  type PropertyId,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import {
  DrizzleMediaItemRepository,
  DrizzleAttachmentRepository,
} from './drizzle-media-repositories';
import { DrizzleDevelopmentRepository } from './drizzle-development-repository';
import { DrizzleMediaQuery } from './drizzle-media-query';
import { DrizzlePropertyRepository } from './drizzle-property-repository';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const media = new DrizzleMediaItemRepository(db);
const files = new DrizzleAttachmentRepository(db);
const query = new DrizzleMediaQuery(db);
const USER = '00000000-0000-7000-8000-0000000000a1';
const NOW = new Date('2026-10-01T12:00:00Z');

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aProperty(code: string): Promise<PropertyId> {
  const property = unwrap(
    Property.create({
      id: unwrap(parseId<'Property'>(ids.next())),
      code,
      kind: 'house',
      operation: { operation: 'sale', currency: 'USD', priceCents: undefined },
      address: {
        street: 'Honduras',
        streetNumber: '5120',
        floor: undefined,
        unit: undefined,
        neighborhood: 'Palermo',
        city: 'CABA',
        province: 'Buenos Aires',
      },
      publishAddress: undefined,
      portalTitle: undefined,
      coordinates: undefined,
      locationId: undefined,
      producerUserId: USER,
      branchId: undefined,
      now: NOW,
    }),
  );
  await new DrizzlePropertyRepository(db, ids).save(property, USER);
  return property.id;
}

function owner(id: PropertyId): MediaOwner {
  return { kind: 'property', id };
}

function mediaId(): MediaItemId {
  return unwrap(parseId<'MediaItem'>(ids.next()));
}

function aPhoto(propertyId: PropertyId, position: number, isCover = false): MediaItem {
  const id = mediaId();
  return unwrap(
    MediaItem.upload({
      id,
      owner: owner(propertyId),
      storageKey: `properties/${propertyId}/media/${id}/original`,
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      position,
      isCover,
      uploadedBy: USER,
      now: NOW,
    }),
  );
}

describe('DrizzleMediaItemRepository', () => {
  it('round-trips a photo and a video, with variants and processing state', async () => {
    const propertyId = await aProperty('CAS0001');
    const photo = aPhoto(propertyId, 0, true);
    await media.save(photo, USER);
    const video = unwrap(
      MediaItem.link({
        id: mediaId(),
        owner: owner(propertyId),
        kind: 'video',
        url: 'https://youtu.be/abc',
        position: 1,
        uploadedBy: USER,
        now: NOW,
      }),
    );
    await media.save(video, USER);

    expect((await media.findById(photo.id))?.toSnapshot()).toEqual(photo.toSnapshot());
    expect((await media.findById(video.id))?.toSnapshot()).toEqual(video.toSnapshot());

    unwrap(
      photo.completeProcessing(
        { variants: { thumbnail: 'a', web: 'b', watermarked: 'c' }, width: 800, height: 600 },
        NOW,
      ),
    );
    unwrap(photo.update({ rotation: 90, description: 'Living' }, NOW));
    await media.save(photo, USER);
    expect((await media.findById(photo.id))?.toSnapshot()).toEqual(photo.toSnapshot());

    expect(await media.count(owner(propertyId))).toBe(2);
    expect(await media.nextPosition(owner(propertyId))).toBe(2);
    expect((await media.listForOwner(owner(propertyId))).map((item) => item.id)).toEqual([
      photo.id,
      video.id,
    ]);
    await media.delete(video.id);
    expect(await media.findById(video.id)).toBeUndefined();
  });

  it('moves the cover inside a transaction without breaking the one-cover rule', async () => {
    const propertyId = await aProperty('CAS0002');
    const first = aPhoto(propertyId, 0, true);
    const second = aPhoto(propertyId, 1);
    await media.save(first, USER);
    await media.save(second, USER);
    await db.transaction(async (tx) => {
      const repository = new DrizzleMediaItemRepository(tx);
      first.markCover(false, NOW);
      await repository.save(first, USER);
      unwrap(second.markCover(true, NOW));
      await repository.save(second, USER);
    });
    expect((await media.findById(second.id))?.isCover).toBe(true);
  });
});

describe('DrizzleMediaQuery', () => {
  it('pages the gallery in order and filters images and links', async () => {
    const propertyId = await aProperty('CAS0003');
    const photos = Array.from({ length: 7 }, (_, position) =>
      aPhoto(propertyId, position, position === 0),
    );
    for (const photo of photos) await media.save(photo, USER);
    await media.save(
      unwrap(
        MediaItem.link({
          id: mediaId(),
          owner: owner(propertyId),
          kind: 'tour_360',
          url: 'https://my.matterport.com/show/?m=abc',
          position: 7,
          uploadedBy: USER,
          now: NOW,
        }),
      ),
      USER,
    );

    const page = await query.listMedia({
      owner: owner(propertyId),
      kind: 'images',
      offset: 5,
      limit: 5,
    });
    expect(page.total).toBe(7);
    expect(page.items.map((item) => item.id)).toEqual([photos[5]?.id, photos[6]?.id]);
    expect(page.items[0]).toMatchObject({ processing: 'pending', hasThumbnail: false });

    const links = await query.listMedia({
      owner: owner(propertyId),
      kind: 'links',
      offset: 0,
      limit: 5,
    });
    expect(links.items).toMatchObject([
      { kind: 'tour_360', externalUrl: 'https://my.matterport.com/show/?m=abc' },
    ]);
  });

  it('pages the active attachments by name or date, with an index', async () => {
    const propertyId = await aProperty('CAS0004');
    for (const [index, name] of ['Reglamento.pdf', 'Escritura.pdf', 'Planos.pdf'].entries()) {
      const id = unwrap(parseId<'Attachment'>(ids.next()));
      const file = unwrap(
        Attachment.upload({
          id,
          owner: owner(propertyId),
          fileName: name,
          storageKey: `properties/${propertyId}/attachments/${id}`,
          contentType: 'application/pdf',
          sizeBytes: 10,
          uploadedBy: USER,
          now: new Date(NOW.getTime() + index * 1000),
        }),
      );
      if (name === 'Planos.pdf') file.delete(NOW);
      await files.save(file, USER);
      expect((await files.findById(id))?.toSnapshot()).toEqual(file.toSnapshot());
    }

    const byName = await query.listAttachments({
      owner: owner(propertyId),
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 10,
    });
    expect(byName.total).toBe(2);
    expect(byName.items.map((item) => item.name)).toEqual(['Escritura.pdf', 'Reglamento.pdf']);
    const newest = await query.listAttachments({
      owner: owner(propertyId),
      sort: { field: 'createdAt', direction: 'desc' },
      offset: 0,
      limit: 1,
    });
    expect(newest.items.map((item) => item.name)).toEqual(['Escritura.pdf']);

    // Con pocas filas Postgres prefiere recorrer la tabla: se le prohíbe para ver qué índice usa.
    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return tx.execute(
        sql`explain select id from core.attachments where property_id = ${propertyId} and deleted_at is null order by name, id limit 10`,
      );
    });
    expect(JSON.stringify(plan.rows)).toContain('attachments_property_name_idx');
  });
});

describe('media of a development', () => {
  async function aDevelopment(): Promise<MediaOwner> {
    const id = ids.next();
    await db.execute(
      sql`insert into core.locations (id, kind, name, normalized_name, path, created_at, updated_at, created_by, updated_by) values (${id}, 'neighborhood', 'Palermo', 'palermo', ${`/${id}/`}, ${NOW}, ${NOW}, ${USER}, ${USER})`,
    );
    const development = Development.create({
      id: unwrap(parseId<'Development'>(ids.next())),
      code: 'EMP0001',
      name: 'Torre Gurruchaga',
      kind: 'building',
      privateAddress: 'Gurruchaga 1834',
      publishAddress: undefined,
      portalTitle: undefined,
      developerName: undefined,
      commercialContactClientId: undefined,
      locationId: id,
      coordinates: unwrap(Coordinates.create(-34.5861, -58.4321)),
      producerUserId: USER,
      branchId: undefined,
      now: NOW,
    });
    await new DrizzleDevelopmentRepository(db).save(development, USER);
    return { kind: 'development', id: development.id };
  }

  it('keeps the gallery and the files apart from the properties, with their indexes', async () => {
    const development = await aDevelopment();
    const propertyId = await aProperty('CAS0005');
    const id = mediaId();
    const photo = unwrap(
      MediaItem.upload({
        id,
        owner: development,
        storageKey: `developments/${development.id}/media/${id}/original`,
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        position: 0,
        isCover: true,
        uploadedBy: USER,
        now: NOW,
      }),
    );
    await media.save(photo, USER);
    await media.save(aPhoto(propertyId, 0, true), USER);

    expect((await media.findById(id))?.toSnapshot()).toEqual(photo.toSnapshot());
    expect((await media.listForOwner(development)).map((item) => item.id)).toEqual([id]);
    expect(await media.count(development)).toBe(1);
    expect(await media.nextPosition(development)).toBe(1);
    const page = await query.listMedia({
      owner: development,
      kind: undefined,
      offset: 0,
      limit: 10,
    });
    expect(page.items.map((item) => item.id)).toEqual([id]);

    const fileId = unwrap(parseId<'Attachment'>(ids.next()));
    const brochure = unwrap(
      Attachment.upload({
        id: fileId,
        owner: development,
        fileName: 'Brochure.pdf',
        storageKey: `developments/${development.id}/attachments/${fileId}`,
        contentType: 'application/pdf',
        sizeBytes: 10,
        uploadedBy: USER,
        now: NOW,
      }),
    );
    await files.save(brochure, USER);
    expect((await files.findById(fileId))?.toSnapshot()).toEqual(brochure.toSnapshot());
    const listed = await query.listAttachments({
      owner: development,
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 10,
    });
    expect(listed.items.map((item) => item.name)).toEqual(['Brochure.pdf']);
    expect((await query.listAttachments({ ...listedCriteria(propertyId) })).total).toBe(0);

    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return tx.execute(
        sql`explain select id from core.attachments where development_id = ${development.id} and deleted_at is null order by name, id limit 10`,
      );
    });
    expect(JSON.stringify(plan.rows)).toContain('attachments_development_name_idx');
  });
});

function listedCriteria(propertyId: PropertyId) {
  return {
    owner: owner(propertyId),
    sort: { field: 'name', direction: 'asc' } as const,
    offset: 0,
    limit: 10,
  };
}
