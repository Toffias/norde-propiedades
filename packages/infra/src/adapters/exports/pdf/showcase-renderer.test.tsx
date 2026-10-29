import { DEFAULT_SHOWCASE_OPTIONS, type ShowcaseContent } from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { PANEL_PROPERTY_DETAIL } from '../panel-property-detail.fixture';

import { qrPath } from './qr';
import { firstWords, pageCount, ReactPdfShowcaseRenderer } from './showcase-renderer';

async function photo() {
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#3366cc' },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(bytes);
}

const PARAGRAPH =
  'Departamento al frente, con balcón corrido y mucha luz natural todo el día, cerca del subte y de la avenida.';

async function content(overrides: Partial<ShowcaseContent> = {}): Promise<ShowcaseContent> {
  return {
    property: PANEL_PROPERTY_DETAIL,
    address: 'Gurruchaga 1834 · Palermo, CABA',
    prices: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    photos: [await photo(), await photo(), await photo()],
    company: { name: 'Norde Propiedades', logo: undefined },
    contact: {
      name: 'Casa central',
      address: 'Gurruchaga 1834',
      phone: '+541148000000',
      whatsapp: '+5491166899124',
      email: 'info@norde.com.ar',
    },
    agent: undefined,
    qrUrl: 'https://norde.com.ar/propiedades/luminoso-3-ambientes',
    options: DEFAULT_SHOWCASE_OPTIONS,
    generatedAt: new Date('2026-10-29T12:00:00Z'),
    ...overrides,
  };
}

async function render(overrides: Partial<ShowcaseContent> = {}) {
  const bytes = await new ReactPdfShowcaseRenderer().render(await content(overrides));
  return { bytes, pdf: await PDFDocument.load(bytes, { updateMetadata: false }) };
}

function text(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

// Armar PDF de verdad (fuentes, fotos con sharp, varias pasadas de react-pdf) con el CI cargado
// pasa los 5 s por defecto, sobre todo el primero, que además carga react-pdf.
describe('ReactPdfShowcaseRenderer', { timeout: 30_000 }, () => {
  it.each([
    ['portrait', 595, 842],
    ['landscape', 842, 595],
  ] as const)('prints a single %s page', async (orientation, width, height) => {
    const { pdf } = await render({ options: { ...DEFAULT_SHOWCASE_OPTIONS, orientation } });
    expect(pdf.getPageCount()).toBe(1);
    const size = pdf.getPage(0).getSize();
    expect([Math.round(size.width), Math.round(size.height)]).toEqual([width, height]);
    expect(pdf.getTitle()).toBe('Vidriera DEP0001');
  });

  it.each(['portrait', 'landscape'] as const)(
    'keeps a description far too long for the page on a single %s page',
    async (orientation) => {
      const description = Array.from({ length: 40 }, () => PARAGRAPH).join('\n\n');
      const { pdf } = await render({
        property: { ...PANEL_PROPERTY_DETAIL, description },
        options: { ...DEFAULT_SHOWCASE_OPTIONS, orientation, descriptionSize: 50 },
      });
      expect(pdf.getPageCount()).toBe(1);
    },
  );

  it('prints with one photo, none, light brand colors and no QR, band or contact', async () => {
    const { pdf } = await render({
      photos: [],
      contact: undefined,
      qrUrl: undefined,
      prices: [],
      options: {
        ...DEFAULT_SHOWCASE_OPTIONS,
        photoCount: 1,
        operationBand: false,
        primaryColor: '#f2f2a0',
        secondaryColor: '#ffffff',
      },
    });
    expect(pdf.getPageCount()).toBe(1);
  });

  it('accepts WebP photos and skips the ones it cannot read', async () => {
    const webp = new Uint8Array(
      await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#cc3366' } })
        .webp()
        .toBuffer(),
    );
    const { pdf } = await render({
      photos: [webp, new Uint8Array([0x52, 0x49, 0x46, 0x46]), await photo()],
    });
    expect(pdf.getPageCount()).toBe(1);
  });

  it('draws the QR as vector paths, not as an image', async () => {
    const withQr = await render({ photos: [] });
    const withoutQr = await render({ photos: [], qrUrl: undefined });
    expect(withQr.bytes.byteLength).toBeGreaterThan(withoutQr.bytes.byteLength);
    expect(text(withQr.bytes).match(/\/Subtype\s*\/Image/g)).toBeNull();
  });
});

describe('qrPath', () => {
  it('draws the dark modules with the quiet zone around them', () => {
    const { size, d } = qrPath('https://norde.com.ar/propiedades/luminoso-3-ambientes');
    // Versión 4 (33 módulos) con corrección M, más 4 de margen por lado.
    expect(size).toBe(41);
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true);
  });
});

describe('firstWords', () => {
  const text = ['Uno dos tres.', 'Cuatro cinco seis.'];

  it('keeps everything when it all fits', () => {
    expect(firstWords(text, 6)).toEqual(text);
  });

  it('cuts in the middle of a paragraph with an ellipsis', () => {
    expect(firstWords(text, 4)).toEqual(['Uno dos tres.', 'Cuatro…']);
  });

  it('marks the cut between two paragraphs too', () => {
    expect(firstWords(text, 3)).toEqual(['Uno dos tres…']);
  });
});

describe('pageCount', () => {
  it('counts the pages of a PDF, not the page tree', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    expect(pageCount(await pdf.save({ useObjectStreams: false }))).toBe(2);
  });
});
