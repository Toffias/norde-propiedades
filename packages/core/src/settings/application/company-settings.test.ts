import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../shared/testing';
import {
  FakeImageWatermarker,
  InMemoryFileStorage,
  InMemorySettingsUnitOfWork,
  RecordingMailer,
} from '../testing';

import { ChangeCompanyLogo } from './commands/change-company-logo';
import { ChangeWatermarkLogo } from './commands/change-watermark-logo';
import { ConfigureWatermark } from './commands/configure-watermark';
import { SendTestEmail } from './commands/send-test-email';
import { UpdateEmailSender } from './commands/update-email-sender';
import { UpdateGeneralSettings } from './commands/update-general-settings';
import { UpdatePdfOptions } from './commands/update-pdf-options';
import { UpdatePortalDescriptionFooter } from './commands/update-portal-description-footer';
import { GetCompanyBrand } from './queries/get-company-brand';
import { GetCompanyLogo } from './queries/get-company-logo';
import { GetCompanySettings } from './queries/get-company-settings';
import { PreviewWatermark } from './queries/preview-watermark';

const admin = Actor.user('00000000-0000-7000-8000-0000000000ad', ['settings:*']);
const agent = Actor.user('00000000-0000-7000-8000-0000000000a6', ['properties:read']);
const PNG = {
  fileName: 'logo.png',
  contentType: 'image/png',
  bytes: new Uint8Array([1, 2, 3]),
} as const;

const general = {
  name: 'Norde Propiedades',
  timezone: 'America/Argentina/Buenos_Aires',
  webPropertyUrlTemplate: 'https://norde.com.ar/propiedades/{slug}',
  newsScope: 'branch',
} as const;

function setup() {
  const uow = new InMemorySettingsUnitOfWork();
  const clock = new FixedClock('2026-05-01T12:00:00Z');
  const ids = new SequentialIdGenerator();
  const storage = new InMemoryFileStorage();
  const mailer = new RecordingMailer();
  const watermarker = new FakeImageWatermarker();
  const settings = uow.companySettings;
  return {
    uow,
    storage,
    mailer,
    watermarker,
    updateGeneral: new UpdateGeneralSettings({ uow, clock }),
    changeLogo: new ChangeCompanyLogo({ uow, storage, ids, clock }),
    configureWatermark: new ConfigureWatermark({ uow, clock }),
    changeWatermarkLogo: new ChangeWatermarkLogo({ uow, storage, ids, clock }),
    previewWatermark: new PreviewWatermark({ settings, storage, watermarker }),
    updateFooter: new UpdatePortalDescriptionFooter({ uow, clock }),
    updatePdf: new UpdatePdfOptions({ uow, clock }),
    updateSender: new UpdateEmailSender({ uow, clock }),
    sendTest: new SendTestEmail({ settings, mailer, uow }),
    getSettings: new GetCompanySettings({ settings }),
    getLogo: new GetCompanyLogo({ settings, storage }),
    getBrand: new GetCompanyBrand({ settings }),
  };
}

describe('UpdateGeneralSettings', () => {
  it('saves the general section with its event and an audit diff', async () => {
    const { uow, updateGeneral, getSettings } = setup();

    unwrap(await updateGeneral.execute(general, admin));

    const view = unwrap(await getSettings.execute({}, admin));
    expect(view).toMatchObject({
      name: 'Norde Propiedades',
      newsScope: 'branch',
      webPropertyUrlTemplate: 'https://norde.com.ar/propiedades/{slug}',
      webDevelopmentUrlTemplate: undefined,
    });
    expect(uow.events.published.map((e) => e.payload)).toEqual([{ section: 'general' }]);
    expect(uow.audit.entries).toEqual([
      {
        kind: 'updated',
        actorId: admin.id,
        source: 'gestion',
        action: 'company_settings.updated',
        entityType: 'company_settings',
        entityId: 'company',
        clientIds: [],
        changes: {
          newsScope: { before: 'all', after: 'branch' },
          webPropertyUrlTemplate: {
            before: null,
            after: 'https://norde.com.ar/propiedades/{slug}',
          },
        },
      },
    ]);
  });

  it('does not save nor audit when nothing changed', async () => {
    const { uow, updateGeneral } = setup();
    unwrap(await updateGeneral.execute(general, admin));

    unwrap(await updateGeneral.execute(general, admin));

    expect(uow.audit.entries).toHaveLength(1);
    expect(uow.events.published).toHaveLength(1);
  });

  it('rejects an invalid url template, naming the field', async () => {
    const { uow, updateGeneral } = setup();
    const result = await updateGeneral.execute(
      { ...general, webDevelopmentUrlTemplate: 'https://norde.com.ar/emprendimientos' },
      admin,
    );
    expect(unwrapErr(result)).toEqual({ type: 'InvalidWebUrlTemplate', field: 'development' });
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects an unknown timezone', async () => {
    const { updateGeneral } = setup();
    const result = await updateGeneral.execute({ ...general, timezone: 'Marte/Olympus' }, admin);
    expect(unwrapErr(result)).toMatchObject({ type: 'ValidationFailed' });
  });

  it('is only for administrators', async () => {
    const { updateGeneral, getSettings } = setup();
    expect(unwrapErr(await updateGeneral.execute(general, agent))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await getSettings.execute({}, agent))).toEqual({ type: 'Forbidden' });
  });
});

describe('ChangeCompanyLogo', () => {
  it('uploads the logo and audits the new key', async () => {
    const { uow, storage, changeLogo, getLogo } = setup();

    unwrap(await changeLogo.execute({ image: PNG }, admin));

    const key = uow.companySettings.row.logoKey;
    expect(key).toMatch(/^settings\/logo\//);
    expect(storage.objects.has(key ?? '')).toBe(true);
    expect(uow.audit.entries[0]?.changes).toEqual({ logoKey: { before: null, after: key } });
    expect(unwrap(await getLogo.execute({ which: 'company' }, admin)).bytes).toEqual(PNG.bytes);
  });

  it('removes the logo without an image', async () => {
    const { uow, changeLogo, getLogo } = setup();
    unwrap(await changeLogo.execute({ image: PNG }, admin));

    unwrap(await changeLogo.execute({}, admin));

    expect(uow.companySettings.row.logoKey).toBeUndefined();
    expect(unwrapErr(await getLogo.execute({ which: 'company' }, admin))).toEqual({
      type: 'NotFound',
    });
  });

  it('rejects a non image file and does not upload it', async () => {
    const { storage, changeLogo } = setup();
    const result = await changeLogo.execute(
      { image: { ...PNG, contentType: 'application/pdf' as 'image/png' } },
      admin,
    );
    expect(unwrapErr(result)).toMatchObject({ type: 'ValidationFailed' });
    expect(storage.objects.size).toBe(0);
  });

  it('deletes the uploaded image when the change fails', async () => {
    const { uow, storage, changeLogo } = setup();
    uow.companySettings.save = () => Promise.reject(new Error('db down'));

    await expect(changeLogo.execute({ image: PNG }, admin)).rejects.toThrow('db down');
    expect(storage.objects.size).toBe(0);
  });

  it('is only for administrators', async () => {
    const { storage, changeLogo } = setup();
    expect(unwrapErr(await changeLogo.execute({ image: PNG }, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(storage.objects.size).toBe(0);
  });
});

describe('GetCompanyLogo', () => {
  it('serves the company logo to any user', async () => {
    const { changeLogo, getLogo } = setup();
    unwrap(await changeLogo.execute({ image: PNG }, admin));

    expect(unwrap(await getLogo.execute({ which: 'company' }, agent)).bytes).toEqual(PNG.bytes);
  });

  it('requires settings:read for the watermark logo', async () => {
    const { changeWatermarkLogo, getLogo } = setup();
    unwrap(await changeWatermarkLogo.execute({ image: PNG }, admin));

    expect(unwrapErr(await getLogo.execute({ which: 'watermark' }, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrap(await getLogo.execute({ which: 'watermark' }, admin)).bytes).toEqual(PNG.bytes);
  });
});

describe('GetCompanyBrand', () => {
  it('has no logo version until a logo is uploaded', async () => {
    const { getBrand } = setup();
    expect(unwrap(await getBrand.execute({}, agent)).logoVersion).toBeUndefined();
  });

  it('returns the name and logo version to any user', async () => {
    const { uow, updateGeneral, changeLogo, getBrand } = setup();
    unwrap(await updateGeneral.execute(general, admin));
    unwrap(await changeLogo.execute({ image: PNG }, admin));

    expect(unwrap(await getBrand.execute({}, agent))).toEqual({
      name: 'Norde Propiedades',
      logoVersion: uow.companySettings.row.logoKey?.split('/').at(-1),
    });
  });
});

describe('watermark', () => {
  const options = { enabled: true, sizePercent: 25, position: 'center', opacity: 50 } as const;

  it('requires a logo before enabling it', async () => {
    const { configureWatermark } = setup();
    expect(unwrapErr(await configureWatermark.execute(options, admin))).toEqual({
      type: 'WatermarkLogoRequired',
    });
  });

  it('enables it after uploading the logo, auditing the change', async () => {
    const { uow, changeWatermarkLogo, configureWatermark, getSettings } = setup();
    unwrap(await changeWatermarkLogo.execute({ image: PNG }, admin));

    unwrap(await configureWatermark.execute(options, admin));

    const { logoVersion, ...view } = unwrap(await getSettings.execute({}, admin)).watermark;
    expect(logoVersion).toBe(uow.companySettings.row.watermark.logoKey?.split('/').at(-1));
    expect(view).toEqual({
      enabled: true,
      hasLogo: true,
      sizePercent: 25,
      position: 'center',
      opacity: 50,
    });
    expect(uow.audit.entries[1]?.changes?.watermark?.after).toMatchObject({
      enabled: true,
      sizePercent: 25,
      position: 'center',
      opacity: 50,
    });
  });

  it('does not remove the logo while the watermark is enabled', async () => {
    const { changeWatermarkLogo, configureWatermark } = setup();
    unwrap(await changeWatermarkLogo.execute({ image: PNG }, admin));
    unwrap(await configureWatermark.execute(options, admin));

    expect(unwrapErr(await changeWatermarkLogo.execute({}, admin))).toEqual({
      type: 'WatermarkLogoRequired',
    });
  });

  it('previews the watermark on a sample photo without saving', async () => {
    const { uow, changeWatermarkLogo, previewWatermark } = setup();
    unwrap(await changeWatermarkLogo.execute({ image: PNG }, admin));
    const audited = uow.audit.entries.length;

    const preview = unwrap(
      await previewWatermark.execute(
        { photo: { contentType: 'image/jpeg', bytes: new Uint8Array([9]) }, options },
        admin,
      ),
    );

    expect(preview).toEqual({
      fileName: 'vista-previa.jpg',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([9, 0xff]),
    });
    expect(uow.audit.entries).toHaveLength(audited);
  });

  it('reports an invalid sample photo and a missing logo', async () => {
    const { watermarker, changeWatermarkLogo, previewWatermark } = setup();
    const input = {
      photo: { contentType: 'image/jpeg', bytes: new Uint8Array([9]) },
      options,
    } as const;
    expect(unwrapErr(await previewWatermark.execute(input, admin))).toEqual({
      type: 'WatermarkLogoRequired',
    });

    unwrap(await changeWatermarkLogo.execute({ image: PNG }, admin));
    watermarker.invalid = true;
    expect(unwrapErr(await previewWatermark.execute(input, admin))).toEqual({
      type: 'InvalidImage',
    });
    expect(unwrapErr(await previewWatermark.execute(input, agent))).toEqual({ type: 'Forbidden' });
  });

  it('is only for administrators', async () => {
    const { configureWatermark, changeWatermarkLogo } = setup();
    expect(unwrapErr(await configureWatermark.execute(options, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await changeWatermarkLogo.execute({ image: PNG }, agent))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('UpdatePortalDescriptionFooter', () => {
  it('saves the footer and clears it when empty', async () => {
    const { uow, updateFooter, getSettings } = setup();

    unwrap(await updateFooter.execute({ footer: 'Código {codigo}' }, admin));
    expect(unwrap(await getSettings.execute({}, admin)).portalDescriptionFooter).toBe(
      'Código {codigo}',
    );
    expect(uow.events.published.map((e) => e.payload)).toEqual([{ section: 'portals' }]);

    unwrap(await updateFooter.execute({ footer: '' }, admin));
    expect(unwrap(await getSettings.execute({}, admin)).portalDescriptionFooter).toBeUndefined();
    expect(uow.audit.entries[1]?.changes).toEqual({
      portalDescriptionFooter: { before: 'Código {codigo}', after: null },
    });
  });

  it('rejects unknown variables', async () => {
    const { updateFooter } = setup();
    expect(unwrapErr(await updateFooter.execute({ footer: 'Precio {precio}' }, admin))).toEqual({
      type: 'UnknownTemplateVariable',
      variable: 'precio',
    });
  });

  it('is only for administrators', async () => {
    const { updateFooter } = setup();
    expect(unwrapErr(await updateFooter.execute({ footer: 'x' }, agent))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('UpdatePdfOptions', () => {
  const pdf = {
    showCompanyContact: true,
    showAgent: false,
    showPrice: false,
    addressOnSend: 'hidden',
    addressOnDownload: 'full',
    developmentPhotosInUnits: true,
  } as const;

  it('saves the options, auditing only what changed', async () => {
    const { uow, updatePdf, getSettings } = setup();

    unwrap(await updatePdf.execute(pdf, admin));

    expect(unwrap(await getSettings.execute({}, admin)).pdfOptions).toEqual(pdf);
    const change = uow.audit.entries[0]?.changes?.pdfOptions;
    expect(change?.before).toMatchObject({ showAgent: true, showPrice: true });
    expect(change?.after).toMatchObject({ showAgent: false, showPrice: false });
  });

  it('is only for administrators', async () => {
    const { updatePdf } = setup();
    expect(unwrapErr(await updatePdf.execute(pdf, agent))).toEqual({ type: 'Forbidden' });
  });
});

describe('email', () => {
  it('saves the sender and sends a test email with it', async () => {
    const { uow, mailer, updateSender, sendTest } = setup();

    unwrap(
      await updateSender.execute({ fromName: 'Norde', replyTo: 'Consultas@Norde.com.ar' }, admin),
    );
    unwrap(await sendTest.execute({ to: 'camila@norde.com.ar' }, admin));

    expect(mailer.sent).toEqual([
      expect.objectContaining({
        to: 'camila@norde.com.ar',
        fromName: 'Norde',
        replyTo: 'consultas@norde.com.ar',
      }),
    ]);
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'company_settings.updated',
      'company_settings.test_email_sent',
    ]);
    // El destinatario no queda en el historial.
    expect(JSON.stringify(uow.audit.entries[1])).not.toContain('camila');
  });

  it('reports the provider error and does not audit the test', async () => {
    const { uow, mailer, sendTest } = setup();
    mailer.failWith = { type: 'MailNotConfigured' };

    expect(unwrapErr(await sendTest.execute({ to: 'camila@norde.com.ar' }, admin))).toEqual({
      type: 'MailNotConfigured',
    });
    expect(uow.audit.entries).toEqual([]);
  });

  it('validates the reply-to address', async () => {
    const { updateSender } = setup();
    expect(
      unwrapErr(await updateSender.execute({ replyTo: 'no-es-un-mail' }, admin)),
    ).toMatchObject({ type: 'ValidationFailed' });
  });

  it('is only for administrators', async () => {
    const { mailer, updateSender, sendTest } = setup();
    expect(unwrapErr(await updateSender.execute({ fromName: 'X' }, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await sendTest.execute({ to: 'a@b.com' }, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(mailer.sent).toEqual([]);
  });
});
