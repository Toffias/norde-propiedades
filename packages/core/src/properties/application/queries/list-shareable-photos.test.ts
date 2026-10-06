import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { CompanySettings, Watermark } from '../../../settings';
import { FakeImageWatermarker, InMemoryFileStorage } from '../../../settings/testing';
import {
  BRANCH_ID,
  FakeImageVariantGenerator,
  InMemoryPropertiesUnitOfWork,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  TEST_NOW,
} from '../../testing';
import { GenerateMediaVariants } from '../commands/generate-media-variants';
import { SetMediaCover } from '../commands/set-media-cover';
import { UpdateMedia } from '../commands/update-media';
import { UploadMedia } from '../commands/upload-media';
import { ListShareablePhotos } from './list-shareable-photos';

const EDITOR = Actor.user(PRODUCER_ID, ['properties:read', 'properties:update']).withBranch(
  BRANCH_ID,
);
const JOBS = Actor.system('scheduler', ['properties:process-media']);
const PORTALS = Actor.system('portal-sync', ['properties:read']);
const OWNER = { kind: 'property', id: PROPERTY_ID } as const;
const PHOTO = { fileName: 'living.jpg', contentType: 'image/jpeg', bytes: new Uint8Array([9]) };
const DAY = 24 * 60 * 60;

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  uow.properties.rows.set(PROPERTY_ID, propertySnapshot());
  const storage = new InMemoryFileStorage();
  storage.signing = true;
  const clock = new FixedClock(TEST_NOW);
  const settings = CompanySettings.defaults();
  settings.configureWatermark(Watermark.disabled(), TEST_NOW);
  const variants = new GenerateMediaVariants({
    uow,
    storage,
    images: new FakeImageVariantGenerator(),
    watermarker: new FakeImageWatermarker(),
    settings: { get: () => Promise.resolve(settings) },
    clock,
  });
  const upload = new UploadMedia({ uow, storage, ids: new SequentialIdGenerator(), clock });

  /** Sube una foto y genera sus variantes, como el job. */
  async function readyPhoto() {
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    unwrap(await variants.execute({ mediaId }, JOBS));
    return mediaId;
  }

  return {
    uow,
    storage,
    readyPhoto,
    upload,
    update: new UpdateMedia({ uow, clock }),
    cover: new SetMediaCover({ uow, clock }),
    list: new ListShareablePhotos({ uow, storage }),
  };
}

describe('ListShareablePhotos', () => {
  it('signs the web version of each ready photo, cover first', async () => {
    const { readyPhoto, cover, list, uow } = setup();
    const first = await readyPhoto();
    const second = await readyPhoto();
    unwrap(await cover.execute({ mediaId: second }, EDITOR));

    const photos = unwrap(
      await list.execute({ propertyId: PROPERTY_ID, expiresInSeconds: DAY, limit: 30 }, PORTALS),
    );

    expect(photos.map((photo) => photo.mediaId)).toEqual([second, first]);
    const web = uow.media.rows.get(second)?.variants.web;
    expect(photos[0]?.url).toBe(`signed:${web}`);
    expect(photos[0]?.version).toBe(uow.media.rows.get(second)?.updatedAt.toISOString());
  });

  it('leaves out photos hidden from the web or still processing', async () => {
    const { readyPhoto, upload, update, list } = setup();
    const hidden = await readyPhoto();
    unwrap(await update.execute({ mediaId: hidden, showOnWeb: false }, EDITOR));
    unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));

    const photos = unwrap(
      await list.execute({ propertyId: PROPERTY_ID, expiresInSeconds: DAY, limit: 30 }, PORTALS),
    );

    expect(photos).toEqual([]);
  });

  it('stops at the limit', async () => {
    const { readyPhoto, list } = setup();
    await readyPhoto();
    await readyPhoto();
    const photos = unwrap(
      await list.execute({ propertyId: PROPERTY_ID, expiresInSeconds: DAY, limit: 1 }, PORTALS),
    );
    expect(photos).toHaveLength(1);
  });

  it('has no photos when the storage cannot sign', async () => {
    const { readyPhoto, list, storage } = setup();
    await readyPhoto();
    storage.signing = false;
    const photos = unwrap(
      await list.execute({ propertyId: PROPERTY_ID, expiresInSeconds: DAY, limit: 30 }, PORTALS),
    );
    expect(photos).toEqual([]);
  });

  it('fails for an unknown property', async () => {
    const { list } = setup();
    expect(
      unwrapErr(
        await list.execute(
          {
            propertyId: '01920000-0000-7000-8000-00000000ffff',
            expiresInSeconds: DAY,
            limit: 30,
          },
          PORTALS,
        ),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
  });

  it('requires properties:read', async () => {
    const { list } = setup();
    expect(
      unwrapErr(
        await list.execute(
          { propertyId: PROPERTY_ID, expiresInSeconds: DAY, limit: 30 },
          Actor.system('portal-sync', []),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });

  it('caps the signature at seven days', async () => {
    const { list } = setup();
    expect(
      unwrapErr(
        await list.execute(
          { propertyId: PROPERTY_ID, expiresInSeconds: 8 * DAY, limit: 30 },
          PORTALS,
        ),
      ).type,
    ).toBe('InvalidInput');
  });
});
