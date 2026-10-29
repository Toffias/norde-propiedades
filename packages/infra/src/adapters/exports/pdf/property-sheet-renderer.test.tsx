import type {
  PropertySheet,
  PropertySheetLayout,
  PropertySheetsContent,
} from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { PANEL_PROPERTY_DETAIL } from '../panel-property-detail.fixture';

import { ReactPdfPropertySheetRenderer } from './property-sheet-renderer';

async function image(format: 'jpeg' | 'png' | 'webp', width = 800, height = 600) {
  const base = sharp({ create: { width, height, channels: 3, background: '#3366cc' } });
  const bytes =
    format === 'jpeg'
      ? await base.jpeg().toBuffer()
      : format === 'png'
        ? await base.png().toBuffer()
        : await base.webp().toBuffer();
  return new Uint8Array(bytes);
}

async function sheet(code: string, overrides: Partial<PropertySheet> = {}): Promise<PropertySheet> {
  return {
    property: { ...PANEL_PROPERTY_DETAIL, id: code, code },
    address: 'Gurruchaga 1834 · Palermo, CABA',
    prices: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    photos: [await image('jpeg'), await image('jpeg'), await image('jpeg')],
    map: undefined,
    webUrl: undefined,
    ...overrides,
  };
}

async function render(
  layout: PropertySheetLayout,
  sheets: readonly PropertySheet[],
  overrides: Partial<Omit<PropertySheetsContent, 'sheets'>> = {},
) {
  const bytes = await new ReactPdfPropertySheetRenderer().render({
    layout,
    title: 'Propiedades seleccionadas',
    company: { name: 'Norde Propiedades', logo: undefined, contact: undefined },
    agent: undefined,
    generatedAt: new Date('2026-10-29T12:00:00Z'),
    sheets: (async function* () {
      for (const entry of sheets) yield await Promise.resolve(entry);
    })(),
    ...overrides,
  });
  return PDFDocument.load(bytes, { updateMetadata: false });
}

function orientation(pdf: PDFDocument): string {
  const { width, height } = pdf.getPage(0).getSize();
  return width > height ? 'landscape' : 'portrait';
}

// Armar PDF de verdad (fuentes, fotos con sharp, varias pasadas de react-pdf) con el CI cargado
// pasa los 5 s por defecto, sobre todo el primero, que además carga react-pdf.
describe('ReactPdfPropertySheetRenderer', { timeout: 30_000 }, () => {
  it('prints one landscape page per property', async () => {
    const pdf = await render('landscape', [await sheet('DEP0001'), await sheet('DEP0002')]);
    expect(pdf.getPageCount()).toBe(2);
    expect(orientation(pdf)).toBe('landscape');
    expect(pdf.getTitle()).toBe('Propiedades seleccionadas');
  });

  it('prints the portrait sheet with its photos, and the map when there is one', async () => {
    const pdf = await render('portrait_map', [
      await sheet('DEP0001', {
        photos: await Promise.all(Array.from({ length: 9 }, () => image('jpeg'))),
        map: await image('png', 1024, 512),
      }),
    ]);
    expect(orientation(pdf)).toBe('portrait');
    // La portada, los datos, la ubicación y nueve fotos no entran en una hoja.
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it('prints the grid as one table, whatever the property types', async () => {
    const pdf = await render('grid', [
      await sheet('DEP0001'),
      await sheet('CAS0001', {
        property: {
          ...PANEL_PROPERTY_DETAIL,
          id: 'CAS0001',
          code: 'CAS0001',
          propertyType: 'house',
        },
        photos: [],
        prices: [],
      }),
    ]);
    expect(pdf.getPageCount()).toBe(1);
    expect(orientation(pdf)).toBe('landscape');
  });

  it('accepts a WebP logo and skips photos or maps it cannot read', async () => {
    const broken = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const pdf = await render(
      'landscape_map',
      [await sheet('DEP0001', { photos: [broken, await image('webp')], map: broken })],
      {
        company: {
          name: 'Norde Propiedades',
          logo: await image('webp', 600, 200),
          contact: {
            name: 'Casa central',
            address: 'Av. Siempreviva 742',
            phone: '+541140000000',
            whatsapp: undefined,
            email: 'hola@norde.com.ar',
            text: undefined,
          },
        },
        agent: {
          name: 'Camila Ruiz',
          address: undefined,
          phone: '+5491155550000',
          whatsapp: undefined,
          email: 'camila@norde.com.ar',
          text: undefined,
        },
      },
    );
    expect(pdf.getPageCount()).toBe(1);
  });

  it('still prints a property without photos, prices or description', async () => {
    const pdf = await render('landscape', [
      await sheet('DEP0001', {
        photos: [],
        prices: [],
        address: '',
        property: { ...PANEL_PROPERTY_DETAIL, description: '', features: [] },
      }),
    ]);
    expect(pdf.getPageCount()).toBe(1);
  });
});
