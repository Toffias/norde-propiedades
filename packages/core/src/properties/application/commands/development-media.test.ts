import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { InMemoryFileStorage } from '../../../settings/testing';
import {
  DEVELOPMENT_ID,
  developmentSnapshot,
  InMemoryMediaQuery,
  InMemoryPropertiesUnitOfWork,
  InMemoryUserNames,
  OTHER_USER_ID,
  PRODUCER_ID,
  TEST_DEVELOPER,
  TEST_NOW,
} from '../../testing';
import { GetAttachmentDownload } from '../queries/get-attachment-download';
import { GetMediaFile } from '../queries/get-media-file';
import { ListAttachments } from '../queries/list-attachments';
import { ListMedia } from '../queries/list-media';
import { AddMediaLink } from './add-media-link';
import { DeleteMedia } from './delete-media';
import { SetMediaCover } from './set-media-cover';
import { UpdateMedia } from './update-media';
import { UploadAttachment } from './upload-attachment';
import { UploadMedia } from './upload-media';

// La galería y los archivos de un emprendimiento: los mismos casos de uso que la propiedad, con el
// emprendimiento como dueño, su permiso de edición y su historial.

const OWNER = { kind: 'development', id: DEVELOPMENT_ID } as const;
const PHOTO = { fileName: 'render.jpg', contentType: 'image/jpeg', bytes: new Uint8Array([9]) };
const BROCHURE = {
  fileName: 'Brochure.pdf',
  contentType: 'application/pdf',
  bytes: new Uint8Array([1]),
};
/** Edita solo sus emprendimientos: el de prueba es de otro captador. */
const STRANGER = Actor.user(OTHER_USER_ID, ['developments:read', 'developments:update']);
/** Edita propiedades, pero no emprendimientos. */
const PROPERTY_EDITOR = Actor.user(PRODUCER_ID, ['properties:read', 'properties:update-all']);

function setup(snapshot = developmentSnapshot()) {
  const uow = new InMemoryPropertiesUnitOfWork();
  uow.developments.rows.set(DEVELOPMENT_ID, snapshot);
  const storage = new InMemoryFileStorage();
  const clock = new FixedClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  return {
    uow,
    storage,
    query: new InMemoryMediaQuery(uow.media, uow.attachments),
    upload: new UploadMedia({ uow, storage, ids, clock }),
    link: new AddMediaLink({ uow, ids, clock }),
    update: new UpdateMedia({ uow, clock }),
    cover: new SetMediaCover({ uow, clock }),
    remove: new DeleteMedia({ uow, clock }),
    uploadFile: new UploadAttachment({ uow, storage, ids, clock }),
  };
}

describe('development gallery', () => {
  it('uploads a photo under the development and records it in its history', async () => {
    const { upload, uow, storage } = setup();
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, TEST_DEVELOPER));

    const row = uow.media.rows.get(mediaId);
    expect(row).toMatchObject({
      owner: OWNER,
      isCover: true,
      storageKey: `developments/${DEVELOPMENT_ID}/media/${mediaId}/original`,
    });
    expect([...storage.objects.keys()]).toEqual([row?.storageKey]);
    expect(uow.events.published).toMatchObject([
      {
        type: 'properties.media_variants_requested',
        payload: { ownerKind: 'development', ownerId: DEVELOPMENT_ID, mediaId },
      },
    ]);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'development.media_added',
      entityType: 'development',
      entityId: DEVELOPMENT_ID,
      clientIds: [],
      changes: { [`media.${mediaId}.kind`]: { before: null, after: 'photo' } },
    });
  });

  it('keeps one cover per development and moves it when the cover is deleted', async () => {
    const { upload, cover, remove, uow } = setup();
    const first = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, TEST_DEVELOPER));
    const second = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, TEST_DEVELOPER));

    unwrap(await cover.execute({ mediaId: second.mediaId }, TEST_DEVELOPER));
    expect(uow.media.rows.get(first.mediaId)?.isCover).toBe(false);
    expect(uow.media.rows.get(second.mediaId)?.isCover).toBe(true);

    unwrap(await remove.execute({ mediaId: second.mediaId }, TEST_DEVELOPER));
    expect(uow.media.rows.get(first.mediaId)?.isCover).toBe(true);
    expect(uow.audit.entries.map((entry) => entry.action)).toEqual([
      'development.media_added',
      'development.media_added',
      'development.cover_changed',
      'development.media_deleted',
    ]);
  });

  it('follows the development edit rules, not the property ones', async () => {
    const { upload, link, storage } = setup();
    for (const actor of [STRANGER, PROPERTY_EDITOR]) {
      expect(unwrapErr(await upload.execute({ owner: OWNER, ...PHOTO }, actor))).toEqual({
        type: 'Forbidden',
      });
    }
    expect(
      unwrapErr(
        await link.execute(
          { owner: OWNER, kind: 'video', url: 'https://youtu.be/abc' },
          PROPERTY_EDITOR,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(storage.objects.size).toBe(0);
  });

  it('does not change the gallery of a development in the trash', async () => {
    const { upload, update, uow } = setup();
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, TEST_DEVELOPER));
    uow.developments.rows.set(
      DEVELOPMENT_ID,
      developmentSnapshot({ deletedAt: TEST_NOW, deletedBy: PRODUCER_ID }),
    );

    expect(unwrapErr(await upload.execute({ owner: OWNER, ...PHOTO }, TEST_DEVELOPER))).toEqual({
      type: 'DevelopmentInTrash',
    });
    expect(
      unwrapErr(await update.execute({ mediaId, description: 'Fachada' }, TEST_DEVELOPER)),
    ).toEqual({ type: 'DevelopmentInTrash' });
  });

  it('reports a development that does not exist', async () => {
    const { upload } = setup();
    const missing = { kind: 'development', id: '00000000-0000-7000-8000-0000000000e9' } as const;
    expect(unwrapErr(await upload.execute({ owner: missing, ...PHOTO }, TEST_DEVELOPER))).toEqual({
      type: 'DevelopmentNotFound',
    });
  });

  it('lists and serves the photos to who can see developments', async () => {
    const { upload, uow, storage, query } = setup();
    const { mediaId } = unwrap(await upload.execute({ owner: OWNER, ...PHOTO }, TEST_DEVELOPER));
    const list = new ListMedia({ media: query });
    const files = new GetMediaFile({ uow, storage });

    expect(
      unwrap(await list.execute({ owner: OWNER }, TEST_DEVELOPER)).items.map((item) => item.id),
    ).toEqual([mediaId]);
    expect(unwrap(await files.execute({ mediaId }, TEST_DEVELOPER))).toMatchObject({
      kind: 'content',
    });

    const propertiesOnly = Actor.user(PRODUCER_ID, ['properties:read']);
    expect(unwrapErr(await list.execute({ owner: OWNER }, propertiesOnly))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await files.execute({ mediaId }, propertiesOnly))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('development files', () => {
  it('uploads a file under the development, lists it and serves it to its readers', async () => {
    const { uploadFile, uow, storage, query } = setup();
    const { attachmentId } = unwrap(
      await uploadFile.execute({ owner: OWNER, ...BROCHURE }, TEST_DEVELOPER),
    );
    expect(storage.objects.has(`developments/${DEVELOPMENT_ID}/attachments/${attachmentId}`)).toBe(
      true,
    );
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'development.attachment_added',
      entityType: 'development',
      entityId: DEVELOPMENT_ID,
    });

    const listed = unwrap(
      await new ListAttachments({ media: query, users: new InMemoryUserNames() }).execute(
        { owner: OWNER },
        TEST_DEVELOPER,
      ),
    );
    expect(listed.items).toMatchObject([{ id: attachmentId, name: 'Brochure.pdf' }]);

    const download = new GetAttachmentDownload({ uow, storage });
    expect(unwrap(await download.execute({ attachmentId }, TEST_DEVELOPER))).toMatchObject({
      kind: 'content',
      fileName: 'Brochure.pdf',
    });
    expect(
      unwrapErr(
        await download.execute({ attachmentId }, Actor.user(PRODUCER_ID, ['properties:read'])),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});
