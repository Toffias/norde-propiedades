import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { CompanySettings } from '../../../settings';
import { FakeImageWatermarker, InMemoryFileStorage } from '../../../settings/testing';
import {
  FakeImageVariantGenerator,
  FakeReservedBannerRenderer,
  InMemoryPropertiesUnitOfWork,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  TEST_NOW,
} from '../../testing';
import { GenerateMediaVariants } from './generate-media-variants';
import { GenerateReservedCover } from './generate-reserved-cover';
import { RequestReservedCovers } from './request-reserved-covers';
import { SetMediaCover } from './set-media-cover';
import { UploadMedia } from './upload-media';

const EDITOR = Actor.user(PRODUCER_ID, ['properties:read', 'properties:update']);
const JOBS = Actor.system('scheduler', ['properties:process-media']);
const NOBODY = Actor.system('scheduler', []);
const OWNER = { kind: 'property', id: PROPERTY_ID } as const;
const PHOTO = { fileName: 'living.jpg', contentType: 'image/jpeg', bytes: new Uint8Array([9]) };

function setup(options: { readonly bannerKey?: string } = {}) {
  const uow = new InMemoryPropertiesUnitOfWork();
  uow.properties.rows.set(PROPERTY_ID, propertySnapshot());
  const storage = new InMemoryFileStorage();
  const clock = new FixedClock(TEST_NOW);
  const renderer = new FakeReservedBannerRenderer();
  const settings = CompanySettings.defaults();
  if (options.bannerKey !== undefined) settings.changeReservedBanner(options.bannerKey, TEST_NOW);
  settings.pullEvents();
  const reader = { get: () => Promise.resolve(settings) };
  const variants = new GenerateMediaVariants({
    uow,
    storage,
    images: new FakeImageVariantGenerator(),
    watermarker: new FakeImageWatermarker(),
    settings: reader,
    clock,
  });
  const upload = new UploadMedia({ uow, storage, ids: new SequentialIdGenerator(), clock });
  /** Sube una foto y genera sus variantes, como lo harían el panel y el job. */
  const processedPhoto = async () => {
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    unwrap(await variants.execute({ mediaId }, JOBS));
    return mediaId;
  };
  return {
    uow,
    storage,
    clock,
    renderer,
    processedPhoto,
    cover: new SetMediaCover({ uow, clock }),
    generate: new GenerateReservedCover({ uow, storage, renderer, settings: reader, clock }),
    request: new RequestReservedCovers({ uow, clock }),
  };
}

function requestedIds(uow: InMemoryPropertiesUnitOfWork): string[] {
  return uow.events.published
    .filter((event) => event.type === 'properties.reserved_cover_requested')
    .map((event) => event.aggregateId);
}

describe('GenerateReservedCover', () => {
  it('puts the default banner on the cover ahead of any reservation', async () => {
    const { uow, storage, renderer, processedPhoto, generate } = setup();
    const mediaId = await processedPhoto();
    // El job de las variantes ya la pidió: la portada se prepara antes de que alguien reserve.
    expect(requestedIds(uow)).toEqual([mediaId]);

    expect(unwrap(await generate.execute({ mediaId }, JOBS))).toBe('ready');
    const key = uow.media.rows.get(mediaId)?.variants.reserved;
    expect(key).toBe(
      `properties/${PROPERTY_ID}/media/${mediaId}/reserved-${TEST_NOW.getTime().toString(36)}`,
    );
    expect(storage.objects.get(key ?? '')?.bytes).toEqual(new Uint8Array([2, 0xbb]));
    expect(storage.immutable.has(key ?? '')).toBe(true);
    expect(renderer.requests[0]?.banner).toBeUndefined();
    // La web y el panel se enteran de la portada nueva.
    expect(uow.events.published.at(-1)).toMatchObject({
      type: 'properties.media_changed',
      payload: { mediaId },
    });
  });

  it('uses the banner loaded in Mi empresa and starts from the watermarked copy', async () => {
    const { uow, storage, renderer, processedPhoto, generate } = setup({
      bannerKey: 'settings/reserved-banner/1',
    });
    await storage.put({
      key: 'settings/reserved-banner/1',
      contentType: 'image/png',
      bytes: new Uint8Array([5]),
    });
    const mediaId = await processedPhoto();
    const row = uow.media.rows.get(mediaId);
    if (!row) throw new Error('missing photo');
    await storage.put({
      key: 'media/marked',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([3]),
    });
    uow.media.rows.set(mediaId, {
      ...row,
      variants: { ...row.variants, watermarked: 'media/marked' },
    });

    unwrap(await generate.execute({ mediaId }, JOBS));
    expect(renderer.requests[0]).toEqual({
      photo: new Uint8Array([3]),
      banner: new Uint8Array([5]),
    });
  });

  it('replaces the previous "Reservado" cover and deletes its file', async () => {
    const { uow, storage, clock, processedPhoto, generate } = setup();
    const mediaId = await processedPhoto();
    unwrap(await generate.execute({ mediaId }, JOBS));
    const first = uow.media.rows.get(mediaId)?.variants.reserved ?? '';
    clock.advance(60_000);
    unwrap(await generate.execute({ mediaId }, JOBS));
    const second = uow.media.rows.get(mediaId)?.variants.reserved ?? '';
    expect(second).not.toBe(first);
    expect(storage.objects.has(first)).toBe(false);
    expect(storage.objects.has(second)).toBe(true);
  });

  it('skips a photo that is not the cover and a missing one', async () => {
    const { uow, processedPhoto, generate } = setup();
    await processedPhoto();
    const other = await processedPhoto();
    expect(unwrap(await generate.execute({ mediaId: other }, JOBS))).toBe('skipped');
    expect(uow.media.rows.get(other)?.variants.reserved).toBeUndefined();
    expect(
      unwrap(await generate.execute({ mediaId: '00000000-0000-7000-8000-0000000000ff' }, JOBS)),
    ).toBe('skipped');
  });

  it('leaves the cover as it is when the image cannot be read', async () => {
    const { uow, renderer, processedPhoto, generate } = setup();
    const mediaId = await processedPhoto();
    renderer.invalid = true;
    expect(unwrap(await generate.execute({ mediaId }, JOBS))).toBe('failed');
    expect(uow.media.rows.get(mediaId)?.variants.reserved).toBeUndefined();
  });

  it('needs the media processing permission', async () => {
    const { processedPhoto, generate } = setup();
    const mediaId = await processedPhoto();
    expect(unwrapErr(await generate.execute({ mediaId }, NOBODY))).toEqual({ type: 'Forbidden' });
  });
});

describe('SetMediaCover', () => {
  it('asks for the "Reservado" version of the new cover', async () => {
    const { uow, processedPhoto, cover } = setup();
    await processedPhoto();
    const second = await processedPhoto();
    unwrap(await cover.execute({ mediaId: second }, EDITOR));
    expect(requestedIds(uow).at(-1)).toBe(second);
  });
});

describe('RequestReservedCovers', () => {
  it('asks for the missing cover of a property that was reserved', async () => {
    const { uow, processedPhoto, request } = setup();
    const mediaId = await processedPhoto();
    uow.events.published.length = 0;
    expect(unwrap(await request.execute({ propertyId: PROPERTY_ID }, JOBS))).toBe(1);
    expect(requestedIds(uow)).toEqual([mediaId]);
  });

  it('does not ask again when the cover already has its "Reservado" version', async () => {
    const { uow, processedPhoto, generate, request } = setup();
    const mediaId = await processedPhoto();
    unwrap(await generate.execute({ mediaId }, JOBS));
    uow.events.published.length = 0;
    expect(unwrap(await request.execute({ propertyId: PROPERTY_ID }, JOBS))).toBe(0);
    expect(requestedIds(uow)).toEqual([]);
  });

  it('asks for every property cover again when the banner changes', async () => {
    const { uow, processedPhoto, generate, request } = setup();
    const mediaId = await processedPhoto();
    await processedPhoto();
    unwrap(await generate.execute({ mediaId }, JOBS));
    uow.events.published.length = 0;
    expect(unwrap(await request.execute({ all: true }, JOBS))).toBe(1);
    expect(requestedIds(uow)).toEqual([mediaId]);
  });

  it('needs the media processing permission and a valid input', async () => {
    const { request } = setup();
    expect(unwrapErr(await request.execute({ all: true }, NOBODY))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await request.execute({ propertyId: 'x' }, JOBS))).toMatchObject({
      type: 'InvalidInput',
    });
  });
});
