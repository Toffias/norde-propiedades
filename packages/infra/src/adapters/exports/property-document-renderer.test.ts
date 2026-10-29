import type { PropertyDocumentContent } from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { PANEL_PROPERTY_DETAIL as property } from './panel-property-detail.fixture';
import { PdfLibPropertyDocumentRenderer } from './property-document-renderer';

async function photo() {
  const image = sharp({ create: { width: 800, height: 600, channels: 3, background: '#3366cc' } });
  return new Uint8Array(await image.jpeg().toBuffer());
}

function content(overrides: Partial<PropertyDocumentContent> = {}): PropertyDocumentContent {
  return {
    kind: 'showcase',
    property,
    address: 'Gurruchaga 1834 · Piso 3 Unidad B · Palermo, CABA',
    addressDisplay: 'full',
    prices: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    photos: [],
    company: { name: 'Norde Propiedades', logo: undefined },
    agent: {
      name: 'Camila Ruiz',
      address: undefined,
      phone: '+5491155550000',
      whatsapp: undefined,
      email: 'camila@norde.com.ar',
    },
    branch: {
      name: 'Casa central',
      address: 'Av. Santa Fe 1234, CABA',
      phone: '+541148001234',
      whatsapp: '+5491166899124',
      email: 'hola@norde.com.ar',
    },
    webUrl: 'https://norde.com.ar/propiedades/departamento-dep0001',
    ownerReport: undefined,
    generatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

describe('PdfLibPropertyDocumentRenderer', () => {
  const renderer = new PdfLibPropertyDocumentRenderer();

  it('renders the one-page showcase and skips photos it cannot embed', async () => {
    const bytes = await renderer.render(
      content({ kind: 'showcase', photos: [new Uint8Array([0x52, 0x49, 0x46, 0x46])] }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Vidriera DEP0001');
    expect(doc.getPageCount()).toBe(1);
  });

  it('keeps the showcase in one page with WebP photos, a long title and no contact', async () => {
    const webp = new Uint8Array(
      await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#cc3366' } })
        .webp()
        .toBuffer(),
    );
    const bytes = await renderer.render(
      content({
        kind: 'showcase',
        photos: [webp, await photo(), await photo()],
        property: {
          ...property,
          portalTitle:
            'Departamento de tres ambientes con balcón corrido, cochera, baulera y amenities en el corazón de Palermo Soho',
        },
        prices: [
          { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
          { operation: 'rent', currency: 'ARS', priceCents: undefined },
        ],
        agent: undefined,
        branch: undefined,
        webUrl: undefined,
      }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('renders the owner report with the publications of the period', async () => {
    const bytes = await renderer.render(
      content({
        kind: 'owner_report',
        ownerReport: {
          from: '2026-09-01',
          to: '2026-09-30',
          publications: [
            {
              portal: 'zonaprop',
              status: 'published',
              publishedAt: undefined,
              views: 120,
              contacts: 4,
              favorites: 9,
            },
          ],
          emailSends: 2,
          whatsappSends: 3,
          inquiries: 4,
          interested: 1,
          portalViews: 120,
          portalContacts: 4,
          monthly: [
            { month: '2026-08', emailSends: 0, whatsappSends: 0, inquiries: 0 },
            { month: '2026-09', emailSends: 2, whatsappSends: 3, inquiries: 4 },
          ],
        },
      }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Reporte al propietario DEP0001');
  });
});
