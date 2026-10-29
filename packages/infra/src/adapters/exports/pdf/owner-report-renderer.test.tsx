import type { OwnerReportContent } from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { PANEL_PROPERTY_DETAIL } from '../panel-property-detail.fixture';

import { ReactPdfOwnerReportRenderer } from './owner-report-renderer';

async function photo() {
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#3366cc' },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(bytes);
}

const ZONAPROP_URL = 'https://www.zonaprop.com.ar/propiedades/aviso-1.html';

async function content(overrides: Partial<OwnerReportContent> = {}): Promise<OwnerReportContent> {
  return {
    property: PANEL_PROPERTY_DETAIL,
    address: 'Gurruchaga 1834 · Palermo, CABA',
    prices: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    photo: await photo(),
    company: { name: 'Norde Propiedades', logo: undefined },
    contact: {
      name: 'Casa central',
      address: 'Gurruchaga 1834',
      phone: '+541148000000',
      whatsapp: '+5491166899124',
      email: 'info@norde.com.ar',
      text: undefined,
    },
    producer: {
      name: 'Camila Ruiz',
      address: undefined,
      phone: '+5491155550000',
      whatsapp: undefined,
      email: 'camila@norde.com.ar',
      text: undefined,
    },
    webUrl: 'https://norde.com.ar/propiedades/luminoso-3-ambientes',
    report: {
      from: '2026-07-01',
      to: '2026-09-30',
      publications: [
        {
          portal: 'zonaprop',
          operation: 'sale',
          permalink: ZONAPROP_URL,
          status: 'published',
          publishedAt: undefined,
          views: 120,
          contacts: 4,
          favorites: 9,
        },
        {
          portal: 'mercadolibre_developments',
          operation: undefined,
          permalink: undefined,
          status: 'paused',
          publishedAt: undefined,
          views: 30,
          contacts: 1,
          favorites: 0,
        },
      ],
      emailSends: 3,
      whatsappSends: 4,
      inquiries: 2,
      interested: 5,
      portalViews: 150,
      portalContacts: 5,
      monthly: [
        { month: '2026-07', emailSends: 1, whatsappSends: 2, inquiries: 0 },
        { month: '2026-08', emailSends: 0, whatsappSends: 0, inquiries: 0 },
        { month: '2026-09', emailSends: 2, whatsappSends: 2, inquiries: 2 },
      ],
      windows: {
        last15Days: { emailSends: 1, whatsappSends: 1, inquiries: 1 },
        last30Days: { emailSends: 2, whatsappSends: 2, inquiries: 2 },
        sinceCreation: { emailSends: 9, whatsappSends: 12, inquiries: 7, from: '2026-03-10' },
      },
    },
    options: { publications: true, statistics: true },
    generatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

async function render(overrides: Partial<OwnerReportContent> = {}) {
  const bytes = await new ReactPdfOwnerReportRenderer().render(await content(overrides));
  return { bytes, pdf: await PDFDocument.load(bytes, { updateMetadata: false }) };
}

function text(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

// Armar PDF de verdad (fuentes, fotos con sharp, varias pasadas de react-pdf) con el CI cargado
// pasa los 5 s por defecto, sobre todo el primero, que además carga react-pdf.
describe('ReactPdfOwnerReportRenderer', { timeout: 30_000 }, () => {
  it('prints the report in portrait with links to the active publications and the web', async () => {
    const { bytes, pdf } = await render();
    expect(pdf.getTitle()).toBe('Reporte al propietario DEP0001');
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeLessThan(height);
    expect(text(bytes)).toContain(ZONAPROP_URL);
    expect(text(bytes)).toContain('https://norde.com.ar/propiedades/luminoso-3-ambientes');
  });

  it('leaves out the publications and the statistics when they are not asked for', async () => {
    const { bytes } = await render({ options: { publications: false, statistics: false } });
    expect(text(bytes)).not.toContain(ZONAPROP_URL);
  });

  it('still prints a property without photo, prices, portals, contact or producer', async () => {
    const base = await content();
    const { pdf } = await render({
      photo: undefined,
      prices: [],
      contact: undefined,
      producer: undefined,
      webUrl: undefined,
      report: { ...base.report, publications: [], monthly: [] },
    });
    expect(pdf.getPageCount()).toBe(1);
  });

  it('flows onto more pages when there are many portals, without cutting a card', async () => {
    const base = await content();
    const [first] = base.report.publications;
    if (first === undefined) throw new Error('fixture without publications');
    const { pdf } = await render({
      report: {
        ...base.report,
        publications: Array.from({ length: 8 }, (_, index) => ({
          ...first,
          permalink: `${ZONAPROP_URL}?${index.toString()}`,
        })),
      },
    });
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
