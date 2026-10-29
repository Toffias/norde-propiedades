import type { PropertyDocumentContent } from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { PANEL_PROPERTY_DETAIL as property } from './panel-property-detail.fixture';
import { PdfLibPropertyDocumentRenderer } from './property-document-renderer';

function content(overrides: Partial<PropertyDocumentContent> = {}): PropertyDocumentContent {
  return {
    kind: 'owner_report',
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

  it.each(['sheet', 'showcase'] as const)('leaves the %s to react-pdf', async (kind) => {
    await expect(renderer.render(content({ kind }))).rejects.toThrow('react-pdf');
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
