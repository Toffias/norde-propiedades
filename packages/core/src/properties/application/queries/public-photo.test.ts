import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { InMemoryFileStorage } from '../../../settings/testing';
import { publicImageVersion } from '../../contracts';
import type { PropertyMediaRecord } from '../ports/property-search-query';
import {
  aPropertyMediaRecord,
  aPropertyRecord,
  aPublishedDevelopmentRecord,
  InMemoryPropertySearchQuery,
  InMemoryPublishedDevelopmentQuery,
} from '../../testing';

import { GetPublicPhoto } from './get-public-photo';

const web = Actor.system('web', ['properties:read']);
const nobody = Actor.system('web', []);
const UPDATED_AT = new Date('2026-10-01T12:00:00Z');
const VERSION = publicImageVersion(UPDATED_AT);

async function setup(media: PropertyMediaRecord, property: Parameters<typeof aPropertyRecord>[0]) {
  const storage = new InMemoryFileStorage();
  for (const key of [media.storageKey, media.variants.web, media.variants.watermarked]) {
    if (key) await storage.put({ key, contentType: 'image/jpeg', bytes: new Uint8Array([1]) });
  }
  const properties = new InMemoryPropertySearchQuery([
    aPropertyRecord({ ...property, media: [media] }),
  ]);
  return new GetPublicPhoto({
    properties,
    developments: new InMemoryPublishedDevelopmentQuery(),
    storage,
  });
}

async function developmentSetup(
  media: PropertyMediaRecord,
  development: Parameters<typeof aPublishedDevelopmentRecord>[0],
) {
  const storage = new InMemoryFileStorage();
  if (media.variants.web) {
    await storage.put({
      key: media.variants.web,
      contentType: 'image/jpeg',
      bytes: new Uint8Array([3]),
    });
  }
  return new GetPublicPhoto({
    properties: new InMemoryPropertySearchQuery(),
    developments: new InMemoryPublishedDevelopmentQuery([
      aPublishedDevelopmentRecord({ ...development, media: [media] }),
    ]),
    storage,
  });
}

describe('GetPublicPhoto', () => {
  it('serves the web version of a photo of a listed property, never the original', async () => {
    const photo = aPropertyMediaRecord({ updatedAt: UPDATED_AT });
    const useCase = await setup(photo, {});
    const delivery = unwrap(await useCase.execute({ mediaId: photo.id, version: VERSION }, web));
    expect(delivery).toEqual({
      kind: 'content',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
  });

  it('prefers the watermarked copy when there is one', async () => {
    const photo = aPropertyMediaRecord({ updatedAt: UPDATED_AT });
    const marked = { ...photo, variants: { ...photo.variants, watermarked: 'media/marked' } };
    const storage = new InMemoryFileStorage();
    await storage.put({
      key: 'media/marked',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([7]),
    });
    const properties = new InMemoryPropertySearchQuery([aPropertyRecord({ media: [marked] })]);
    const delivery = unwrap(
      await new GetPublicPhoto({
        properties,
        developments: new InMemoryPublishedDevelopmentQuery(),
        storage,
      }).execute({ mediaId: photo.id, version: VERSION }, web),
    );
    expect(delivery).toMatchObject({ kind: 'content', bytes: new Uint8Array([7]) });
  });

  it('sends an old version to the current URL', async () => {
    const photo = aPropertyMediaRecord({ updatedAt: UPDATED_AT });
    const useCase = await setup(photo, {});
    expect(unwrap(await useCase.execute({ mediaId: photo.id, version: 'old' }, web))).toEqual({
      kind: 'moved',
      path: `/fotos/${photo.id}/${VERSION}`,
    });
  });

  it('links an imported photo without its own file', async () => {
    const photo = aPropertyMediaRecord({
      storageKey: null,
      variants: {},
      externalUrl: 'https://static.tokkobroker.com/pictures/1.jpg',
    });
    const useCase = await setup(photo, {});
    expect(unwrap(await useCase.execute({ mediaId: photo.id, version: 'any' }, web))).toEqual({
      kind: 'external',
      url: 'https://static.tokkobroker.com/pictures/1.jpg',
    });
  });

  it.each([
    ['an unlisted property', {}, { status: 'reserved' as const }],
    ['an unpublished property', {}, { publishedOnWeb: false }],
    ['a hidden photo', { showOnWeb: false }, {}],
    ['a photo still processing', { processing: 'pending' as const }, {}],
    ['a video', { kind: 'video' as const, externalUrl: 'https://youtu.be/x' }, {}],
  ])('hides %s', async (_, mediaOverrides, propertyOverrides) => {
    const photo = aPropertyMediaRecord({ updatedAt: UPDATED_AT, ...mediaOverrides });
    const useCase = await setup(photo, propertyOverrides);
    expect(unwrapErr(await useCase.execute({ mediaId: photo.id, version: VERSION }, web))).toEqual({
      type: 'PhotoNotFound',
    });
  });

  it('answers not found for an unknown or invalid id, and needs properties:read', async () => {
    const photo = aPropertyMediaRecord({ updatedAt: UPDATED_AT });
    const useCase = await setup(photo, {});
    const unknown = '00000000-0000-7000-8003-ffffffffffff';
    expect(unwrapErr(await useCase.execute({ mediaId: unknown, version: VERSION }, web))).toEqual({
      type: 'PhotoNotFound',
    });
    expect(unwrapErr(await useCase.execute({ mediaId: 'x', version: VERSION }, web))).toEqual({
      type: 'PhotoNotFound',
    });
    expect(
      unwrapErr(await useCase.execute({ mediaId: photo.id, version: VERSION }, nobody)),
    ).toEqual({ type: 'Forbidden' });
  });

  it('serves a photo of a development being marketed', async () => {
    const photo = aPropertyMediaRecord({ updatedAt: UPDATED_AT });
    const useCase = await developmentSetup(photo, {});
    expect(
      unwrap(await useCase.execute({ mediaId: photo.id, version: VERSION }, web)),
    ).toMatchObject({ kind: 'content', bytes: new Uint8Array([3]) });
  });

  it.each([
    ['still loading information', { status: 'loading' as const }],
    ['in the trash', { deletedAt: new Date('2026-10-02T12:00:00Z') }],
  ])('hides the photos of a development %s', async (_, development) => {
    const photo = aPropertyMediaRecord({ updatedAt: UPDATED_AT });
    const useCase = await developmentSetup(photo, development);
    expect(unwrapErr(await useCase.execute({ mediaId: photo.id, version: VERSION }, web))).toEqual({
      type: 'PhotoNotFound',
    });
  });
});
