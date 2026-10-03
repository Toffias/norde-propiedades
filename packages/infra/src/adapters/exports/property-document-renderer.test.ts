import type { PanelPropertyDetail, PropertyDocumentContent } from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { PdfLibPropertyDocumentRenderer } from './property-document-renderer';

const property: PanelPropertyDetail = {
  id: '00000000-0000-7000-8000-0000000000c1',
  code: 'DEP0001',
  slug: 'departamento-dep0001',
  propertyType: 'apartment',
  status: 'available',
  statusChangedAt: new Date('2026-09-01T12:00:00Z'),
  address: {
    street: 'Gurruchaga',
    streetNumber: '1834',
    floor: '3',
    unit: 'B',
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'Buenos Aires',
  },
  publishAddress: 'Gurruchaga al 1800',
  portalTitle: 'Luminoso 3 ambientes con balcón',
  description: 'Departamento al frente, con balcón corrido y mucha luz.\nCerca del subte.',
  locationId: undefined,
  locationPath: [],
  coordinates: undefined,
  operations: [
    {
      operation: 'sale',
      currency: 'USD',
      priceCents: 12_000_000n,
      priceOnRequest: false,
      commissionPct: 3,
    },
  ],
  characteristics: {
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    toilets: undefined,
    parkingSpaces: 1,
    ageYears: 15,
    orientation: 'north',
    condition: 'very_good',
    disposition: 'front',
    isFurnished: false,
    professionalUse: false,
    surfaceTotalM2: 80.5,
    surfaceCoveredM2: 70,
    surfaceSemiCoveredM2: undefined,
    surfaceLandM2: undefined,
    frontM: undefined,
    depthM: undefined,
  },
  deal: {
    isExclusive: true,
    acceptsSwap: false,
    immediateDeed: true,
    hasFinancing: false,
    creditEligible: true,
    expensesCents: 8_500_000n,
  },
  features: [
    { id: 'f1', kind: 'amenity', name: 'Pileta' },
    { id: 'f2', kind: 'service', name: 'Gas natural' },
  ],
  tags: [],
  customAttributes: [],
  internal: {
    maintenance: undefined,
    appraisers: [],
    keysLocation: undefined,
    legalInfo: undefined,
    internalComments: undefined,
  },
  publication: {
    publishedOnWeb: true,
    showPriceOnWeb: true,
    featured: false,
    showExactAddress: false,
  },
  isPubliclyListed: true,
  producer: undefined,
  branchId: undefined,
  owners: [],
  cover: undefined,
  development: undefined,
  counts: { media: 2, attachments: 0 },
  createdAt: new Date('2026-09-01T12:00:00Z'),
  createdBy: undefined,
  updatedAt: new Date('2026-09-01T12:00:00Z'),
  deletedAt: undefined,
};

async function photo() {
  const image = sharp({ create: { width: 800, height: 600, channels: 3, background: '#3366cc' } });
  return new Uint8Array(await image.jpeg().toBuffer());
}

function content(overrides: Partial<PropertyDocumentContent> = {}): PropertyDocumentContent {
  return {
    kind: 'sheet',
    property,
    address: 'Gurruchaga 1834 · Piso 3 Unidad B · Palermo, CABA',
    addressDisplay: 'full',
    prices: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    photos: [],
    company: { name: 'Norde Propiedades', logo: undefined },
    agentName: 'Camila Ruiz',
    ownerReport: undefined,
    generatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

describe('PdfLibPropertyDocumentRenderer', () => {
  const renderer = new PdfLibPropertyDocumentRenderer();

  it('renders the sheet with photos as a valid PDF', async () => {
    const photos = await Promise.all([photo(), photo(), photo()]);
    const bytes = await renderer.render(content({ photos }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Ficha DEP0001');
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders the one-page showcase and skips photos it cannot embed', async () => {
    const bytes = await renderer.render(
      content({ kind: 'showcase', photos: [new Uint8Array([0x52, 0x49, 0x46, 0x46])] }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Vidriera DEP0001');
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
        },
      }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Reporte al propietario DEP0001');
  });
});
