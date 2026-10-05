import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { CompanySettings, Watermark } from '../../../settings';
import { FakeImageWatermarker, InMemoryFileStorage } from '../../../settings/testing';
import {
  BRANCH_ID,
  FakeImageVariantGenerator,
  InMemoryPropertiesUnitOfWork,
  InMemoryMediaQuery,
  InMemoryUserNames,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { GetAttachmentDownload } from '../queries/get-attachment-download';
import { GetMediaFile } from '../queries/get-media-file';
import { ListAttachments } from '../queries/list-attachments';
import { ListMedia } from '../queries/list-media';
import { AddMediaLink } from './add-media-link';
import { DeleteAttachment } from './delete-attachment';
import { DeleteMedia } from './delete-media';
import { DeleteStoredMediaFiles } from './delete-stored-media-files';
import { GenerateMediaVariants } from './generate-media-variants';
import { ReorderMedia } from './reorder-media';
import { SetMediaCover } from './set-media-cover';
import { UpdateAttachment } from './update-attachment';
import { UpdateMedia } from './update-media';
import { UploadAttachment } from './upload-attachment';
import { UploadMedia } from './upload-media';

const EDITOR = Actor.user(PRODUCER_ID, ['properties:read', 'properties:update']).withBranch(
  BRANCH_ID,
);
/** Edita solo lo suyo: la propiedad de prueba es de otro captador. */
const STRANGER = Actor.user(OTHER_USER_ID, ['properties:read', 'properties:update']);
const JOBS = Actor.system('scheduler', ['properties:process-media']);
const OWNER = { kind: 'property', id: PROPERTY_ID } as const;
const PHOTO = { fileName: 'living.jpg', contentType: 'image/jpeg', bytes: new Uint8Array([9]) };

function settingsWith(watermark: Watermark) {
  const settings = CompanySettings.defaults();
  settings.configureWatermark(watermark, TEST_NOW);
  return { get: () => Promise.resolve(settings) };
}

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  uow.properties.rows.set(PROPERTY_ID, propertySnapshot());
  const storage = new InMemoryFileStorage();
  const clock = new FixedClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  const images = new FakeImageVariantGenerator();
  const query = new InMemoryMediaQuery(uow.media, uow.attachments);
  return {
    uow,
    storage,
    clock,
    images,
    query,
    upload: new UploadMedia({ uow, storage, ids, clock }),
    link: new AddMediaLink({ uow, ids, clock }),
    update: new UpdateMedia({ uow, clock }),
    reorder: new ReorderMedia({ uow, clock }),
    cover: new SetMediaCover({ uow, clock }),
    remove: new DeleteMedia({ uow, clock }),
    variants: (watermark = Watermark.disabled()) =>
      new GenerateMediaVariants({
        uow,
        storage,
        images,
        watermarker: new FakeImageWatermarker(),
        settings: settingsWith(watermark),
        clock,
      }),
  };
}

describe('UploadMedia', () => {
  it('stores the original, leaves it processing and asks for its variants', async () => {
    const { upload, uow, storage } = setup();
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    const row = uow.media.rows.get(mediaId);
    expect(row).toMatchObject({
      kind: 'photo',
      isCover: true,
      position: 0,
      processing: 'pending',
      storageKey: `properties/${PROPERTY_ID}/media/${mediaId}/original`,
    });
    expect([...storage.objects.keys()]).toEqual([row?.storageKey]);
    expect(uow.events.published).toMatchObject([
      { type: 'properties.media_variants_requested', payload: { mediaId } },
    ]);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property.media_added',
      entityType: 'property',
      entityId: PROPERTY_ID,
      changes: { [`media.${mediaId}.kind`]: { before: null, after: 'photo' } },
    });
  });

  it('makes only the first photo the cover', async () => {
    const { upload, uow } = setup();
    unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    const second = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    expect(uow.media.rows.get(second.mediaId)).toMatchObject({ isCover: false, position: 1 });
  });

  it('rejects other file types and uploads nothing', async () => {
    const { upload, storage } = setup();
    const result = await upload.execute(
      { owner: OWNER, ...PHOTO, contentType: 'application/pdf' },
      EDITOR,
    );
    expect(unwrapErr(result)).toEqual({ type: 'UnsupportedMediaType' });
    expect(storage.objects.size).toBe(0);
  });

  it('checks who can edit the property before uploading', async () => {
    const { upload, storage } = setup();
    expect(unwrapErr(await upload.execute({ owner: OWNER, ...PHOTO }, STRANGER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await upload.execute({ owner: OWNER, ...PHOTO }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
    expect(storage.objects.size).toBe(0);
  });
});

describe('GenerateMediaVariants', () => {
  it('stores the thumbnail and the web version and marks the photo ready', async () => {
    const { upload, variants, uow, storage, images } = setup();
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    expect(unwrap(await variants().execute({ mediaId }, JOBS))).toBe('ready');
    const row = uow.media.rows.get(mediaId);
    expect(row).toMatchObject({ processing: 'ready', width: 1600, height: 1200 });
    expect(row?.variants.watermarked).toBeUndefined();
    expect(storage.objects.has(row?.variants.thumbnail ?? '')).toBe(true);
    expect(images.requests[0]?.rotation).toBe(0);
  });

  it('adds the watermarked copy when Mi empresa has it enabled', async () => {
    const { upload, variants, uow, storage } = setup();
    await storage.put({
      key: 'settings/watermark',
      contentType: 'image/png',
      bytes: new Uint8Array([7]),
    });
    const watermark = unwrap(
      Watermark.create({ ...Watermark.DEFAULTS, enabled: true, logoKey: 'settings/watermark' }),
    );
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    unwrap(await variants(watermark).execute({ mediaId }, JOBS));
    const key = uow.media.rows.get(mediaId)?.variants.watermarked;
    expect(key).toBeDefined();
    expect(storage.objects.get(key ?? '')?.bytes).toEqual(new Uint8Array([2, 0xff]));
  });

  it('marks a damaged image as failed', async () => {
    const { upload, variants, uow, images } = setup();
    images.invalid = true;
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    expect(unwrap(await variants().execute({ mediaId }, JOBS))).toBe('failed');
    expect(uow.media.rows.get(mediaId)).toMatchObject({
      processing: 'failed',
      processingError: 'La imagen está dañada o no se puede leer.',
    });
  });

  it('ignores a photo deleted before the job ran, and needs the jobs permission', async () => {
    const { variants } = setup();
    expect(
      unwrap(await variants().execute({ mediaId: '00000000-0000-7000-8000-0000000000ff' }, JOBS)),
    ).toBe('gone');
    expect(
      unwrapErr(
        await variants().execute({ mediaId: '00000000-0000-7000-8000-0000000000ff' }, EDITOR),
      ),
    ).toEqual({ type: 'Forbidden' });
  });

  it('replaces the variants of a previous rotation', async () => {
    const { upload, update, variants, uow, storage } = setup();
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    unwrap(await variants().execute({ mediaId }, JOBS));
    const first = uow.media.rows.get(mediaId)?.variants.thumbnail ?? '';
    unwrap(await update.execute({ mediaId, rotation: 90 }, EDITOR));
    expect(uow.media.rows.get(mediaId)?.processing).toBe('pending');
    const later = new GenerateMediaVariants({
      uow,
      storage,
      images: new FakeImageVariantGenerator(),
      watermarker: new FakeImageWatermarker(),
      settings: settingsWith(Watermark.disabled()),
      clock: new FixedClock(new Date(TEST_NOW.getTime() + 60_000)),
    });
    unwrap(await later.execute({ mediaId }, JOBS));
    expect(storage.objects.has(first)).toBe(false);
    expect(uow.media.rows.get(mediaId)?.rotation).toBe(90);
  });
});

describe('gallery edits', () => {
  async function gallery() {
    const ctx = setup();
    const a = unwrap(await ctx.upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    const b = unwrap(await ctx.upload.execute({ owner: OWNER, ...PHOTO }, EDITOR));
    const video = unwrap(
      await ctx.link.execute(
        { owner: OWNER, kind: 'video', url: 'https://youtu.be/abc123' },
        EDITOR,
      ),
    );
    ctx.uow.audit.entries.splice(0);
    ctx.uow.events.published.splice(0);
    return { ...ctx, a: a.mediaId, b: b.mediaId, video: video.mediaId };
  }

  it('updates the flags of a photo and audits them against the property', async () => {
    const { update, uow, a } = await gallery();
    unwrap(
      await update.execute(
        { mediaId: a, showOnWeb: false, isFloorPlan: true, description: ' Plano PB ' },
        EDITOR,
      ),
    );
    expect(uow.media.rows.get(a)).toMatchObject({
      showOnWeb: false,
      kind: 'floor_plan',
      description: 'Plano PB',
    });
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property.media_updated',
      entityId: PROPERTY_ID,
      changes: {
        [`media.${a}.showOnWeb`]: { before: true, after: false },
        [`media.${a}.kind`]: { before: 'photo', after: 'floor_plan' },
        [`media.${a}.description`]: { before: null, after: 'Plano PB' },
      },
    });
    expect(uow.events.published).toEqual([]);
  });

  it('asks for new variants when the photo is rotated', async () => {
    const { update, uow, a } = await gallery();
    unwrap(await update.execute({ mediaId: a, rotation: 270 }, EDITOR));
    expect(uow.events.published).toMatchObject([
      { type: 'properties.media_variants_requested', payload: { mediaId: a } },
    ]);
  });

  it('does not rotate a video', async () => {
    const { update, video } = await gallery();
    expect(unwrapErr(await update.execute({ mediaId: video, rotation: 90 }, EDITOR))).toEqual({
      type: 'NotAnImage',
    });
  });

  it('only accepts known video and tour providers', async () => {
    const { link } = await gallery();
    expect(
      unwrapErr(
        await link.execute({ owner: OWNER, kind: 'tour_360', url: 'https://youtu.be/abc' }, EDITOR),
      ),
    ).toEqual({ type: 'InvalidMediaUrl' });
  });

  it.each([
    'https://evil.com/youtube.com',
    'https://youtube.com@evil.com/watch',
    'https://evil.com\\@youtube.com/watch',
    'https://youtube.com.evil.com/watch',
  ])('rejects %s as a video link', async (url) => {
    const { link } = await gallery();
    expect(unwrapErr(await link.execute({ owner: OWNER, kind: 'video', url }, EDITOR))).toEqual({
      type: 'InvalidMediaUrl',
    });
  });

  it.each([
    'https://www.YouTube.com/watch?v=abc',
    'https://vimeo.com:443/123',
    'https://player.vimeo.com#t=1',
    ' https://youtu.be/abc ',
  ])('accepts %s as a video link', async (url) => {
    const { link } = await gallery();
    unwrap(await link.execute({ owner: OWNER, kind: 'video', url }, EDITOR));
  });

  it('reorders the whole gallery', async () => {
    const { reorder, uow, a, b, video } = await gallery();
    unwrap(await reorder.execute({ owner: OWNER, mediaIds: [video, b, a] }, EDITOR));
    expect([a, b, video].map((id) => uow.media.rows.get(id)?.position)).toEqual([2, 1, 0]);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property.media_reordered',
      changes: { mediaOrder: { before: [a, b, video], after: [video, b, a] } },
    });
    expect(unwrapErr(await reorder.execute({ owner: OWNER, mediaIds: [a, b] }, EDITOR))).toEqual({
      type: 'InvalidMediaOrder',
    });
  });

  it('moves the cover to another photo, but not to a video', async () => {
    const { cover, uow, a, b, video } = await gallery();
    unwrap(await cover.execute({ mediaId: b }, EDITOR));
    expect(uow.media.rows.get(a)?.isCover).toBe(false);
    expect(uow.media.rows.get(b)?.isCover).toBe(true);
    expect(uow.audit.entries[0]?.changes).toEqual({ coverMediaId: { before: a, after: b } });
    expect(unwrapErr(await cover.execute({ mediaId: video }, EDITOR))).toEqual({
      type: 'NotAnImage',
    });
  });

  it('deletes the cover, passes it to the next photo and asks to clean the storage', async () => {
    const { remove, uow, a, b, storage } = await gallery();
    const keys = [...storage.objects.keys()].filter((key) => key.includes(a));
    unwrap(await remove.execute({ mediaId: a }, EDITOR));
    expect(uow.media.rows.has(a)).toBe(false);
    expect(uow.media.rows.get(b)?.isCover).toBe(true);
    expect(uow.events.published).toMatchObject([
      { type: 'properties.media_deleted', payload: { mediaId: a, storageKeys: keys } },
    ]);
    expect(uow.audit.entries[0]).toMatchObject({ action: 'property.media_deleted' });

    unwrap(await new DeleteStoredMediaFiles({ storage }).execute({ storageKeys: keys }, JOBS));
    expect([...storage.objects.keys()].some((key) => key.includes(a))).toBe(false);
  });

  it('refuses gallery edits from someone who cannot edit the property', async () => {
    const { update, remove, a } = await gallery();
    expect(unwrapErr(await update.execute({ mediaId: a, showOnWeb: false }, STRANGER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await remove.execute({ mediaId: a }, STRANGER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('lists the gallery in order and serves the thumbnail or the original', async () => {
    const { query, uow, storage, a, b, variants } = await gallery();
    const list = unwrap(
      await new ListMedia({ media: query }).execute({ owner: OWNER, kind: 'images' }, EDITOR),
    );
    expect(list.items.map((item) => item.id)).toEqual([a, b]);
    expect(list.total).toBe(2);

    const files = new GetMediaFile({ uow, storage });
    // Sin variantes todavía: se entrega la original.
    expect(unwrap(await files.execute({ mediaId: a }, EDITOR))).toMatchObject({
      kind: 'content',
      contentType: 'image/jpeg',
    });
    unwrap(await variants().execute({ mediaId: a }, JOBS));
    storage.signing = true;
    const delivery = unwrap(await files.execute({ mediaId: a, variant: 'thumbnail' }, EDITOR));
    expect(delivery).toEqual({
      kind: 'redirect',
      url: `signed:${uow.media.rows.get(a)?.variants.thumbnail ?? ''}`,
    });
    expect(unwrapErr(await files.execute({ mediaId: a }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('attachments', () => {
  const DEED = {
    fileName: 'Escritura 2019.pdf',
    contentType: 'application/pdf',
    bytes: new Uint8Array([1, 2, 3]),
  };

  function attachments() {
    const ctx = setup();
    const ids = new SequentialIdGenerator();
    return {
      ...ctx,
      uploadFile: new UploadAttachment({
        uow: ctx.uow,
        storage: ctx.storage,
        ids,
        clock: ctx.clock,
      }),
      updateFile: new UpdateAttachment({ uow: ctx.uow, clock: ctx.clock }),
      deleteFile: new DeleteAttachment({ uow: ctx.uow, clock: ctx.clock }),
      download: new GetAttachmentDownload({ uow: ctx.uow, storage: ctx.storage }),
    };
  }

  it('uploads, renames, shows on the web and soft-deletes a file, all in the history', async () => {
    const { uploadFile, updateFile, deleteFile, uow, storage, query } = attachments();
    const { attachmentId } = unwrap(await uploadFile.execute({ owner: OWNER, ...DEED }, EDITOR));
    expect(storage.objects.has(`properties/${PROPERTY_ID}/attachments/${attachmentId}`)).toBe(true);
    unwrap(
      await updateFile.execute({ attachmentId, name: 'Escritura.pdf', showOnWeb: true }, EDITOR),
    );
    const listed = unwrap(
      await new ListAttachments({ media: query, users: new InMemoryUserNames() }).execute(
        { owner: OWNER },
        EDITOR,
      ),
    );
    expect(listed.items).toMatchObject([
      { id: attachmentId, name: 'Escritura.pdf', showOnWeb: true, uploadedBy: { id: PRODUCER_ID } },
    ]);
    unwrap(await deleteFile.execute({ attachmentId }, EDITOR));
    expect(uow.attachments.rows.get(attachmentId)?.deletedAt).toEqual(TEST_NOW);
    expect(uow.audit.entries.map((entry) => entry.action)).toEqual([
      'property.attachment_added',
      'property.attachment_updated',
      'property.attachment_deleted',
    ]);
    expect(uow.audit.entries.every((entry) => entry.entityId === PROPERTY_ID)).toBe(true);
  });

  it('rejects executables and files without a name', async () => {
    const { uploadFile, storage } = attachments();
    expect(
      unwrapErr(
        await uploadFile.execute(
          { owner: OWNER, ...DEED, contentType: 'application/x-msdownload' },
          EDITOR,
        ),
      ),
    ).toEqual({ type: 'UnsupportedAttachmentType' });
    expect(
      unwrapErr(await uploadFile.execute({ owner: OWNER, ...DEED, fileName: '/\\' }, EDITOR)),
    ).toEqual({ type: 'InvalidAttachmentName' });
    expect(storage.objects.size).toBe(0);
  });

  it('downloads with a signed URL or the content, never a deleted file', async () => {
    const { uploadFile, deleteFile, download, storage } = attachments();
    const { attachmentId } = unwrap(await uploadFile.execute({ owner: OWNER, ...DEED }, EDITOR));
    expect(unwrap(await download.execute({ attachmentId }, EDITOR))).toEqual({
      kind: 'content',
      fileName: 'Escritura 2019.pdf',
      contentType: 'application/pdf',
      bytes: DEED.bytes,
    });
    storage.signing = true;
    expect(unwrap(await download.execute({ attachmentId }, EDITOR))).toEqual({
      kind: 'redirect',
      url: `signed:properties/${PROPERTY_ID}/attachments/${attachmentId}`,
    });
    unwrap(await deleteFile.execute({ attachmentId }, EDITOR));
    expect(unwrapErr(await download.execute({ attachmentId }, EDITOR))).toEqual({
      type: 'AttachmentNotFound',
    });
  });

  it('checks who can edit the property', async () => {
    const { uploadFile } = attachments();
    expect(unwrapErr(await uploadFile.execute({ owner: OWNER, ...DEED }, STRANGER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('DeleteStoredMediaFiles', () => {
  it('only deletes keys of a property gallery', async () => {
    const storage = new InMemoryFileStorage();
    const result = await new DeleteStoredMediaFiles({ storage }).execute(
      { storageKeys: ['company-files/abc'] },
      JOBS,
    );
    expect(unwrapErr(result).type).toBe('InvalidInput');
  });
});
