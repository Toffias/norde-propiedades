import type { AppraisalReportContent } from '@norde/core/appraisals';
import type { AppraisalDetail } from '@norde/core/appraisals/contracts';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { PdfLibAppraisalReportRenderer } from './appraisal-report-renderer';

const appraisal: AppraisalDetail = {
  id: '00000000-0000-7000-8000-0000000000d1',
  code: 'TAS0001',
  status: 'appraised',
  propertyType: 'apartment',
  address: 'Gurruchaga 1834 3° B',
  requester: { id: '00000000-0000-7000-8000-0000000000c1', name: 'Ana Pérez' },
  producer: { id: '00000000-0000-7000-8000-0000000000a1', name: 'Camila Díaz' },
  appraiser: { id: '00000000-0000-7000-8000-0000000000a2', name: 'Juan Gómez' },
  branch: undefined,
  visitAt: undefined,
  createdAt: new Date('2026-09-01T12:00:00Z'),
  deletedAt: undefined,
  source: 'manual',
  surfaceTotalM2: 80.5,
  surfaceCoveredM2: 70,
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  condition: 'very_good',
  statusChangedAt: new Date('2026-09-20T12:00:00Z'),
  updatedAt: new Date('2026-09-20T12:00:00Z'),
  result: {
    sale: { minCents: 11_000_000n, maxCents: 12_000_000n, currency: 'USD' },
    rent: { minCents: 80_000_000n, maxCents: 80_000_000n, currency: 'ARS' },
    comparables: [
      {
        address: 'Mitre 1500, a dos cuadras, con un nombre de calle larguísimo que no entra',
        price: { amountCents: 11_800_000n, currency: 'USD' },
        surfaceM2: 65,
        url: 'https://www.zonaprop.com.ar/propiedades/123',
        note: 'Publicada hace 3 meses.',
        pricePerM2: { amountCents: 181_538n, currency: 'USD' },
      },
      {
        address: 'Belgrano 200',
        price: { amountCents: 12_500_000n, currency: 'USD' },
        surfaceM2: undefined,
        url: undefined,
        note: undefined,
        pricePerM2: undefined,
      },
    ],
    observations: 'Muy luminoso, “al frente” y con balcón.\nNecesita pintura.',
  },
  photoIds: [],
  convertedProperty: undefined,
  nextStatuses: [],
  convertible: true,
  reportable: true,
};

async function jpeg(width = 800, height = 600) {
  const image = sharp({ create: { width, height, channels: 3, background: '#3366cc' } });
  return new Uint8Array(await image.jpeg().toBuffer());
}

async function* stream(photos: readonly Uint8Array[]) {
  for (const photo of photos) yield await Promise.resolve(photo);
}

function content(overrides: Partial<AppraisalReportContent> = {}): AppraisalReportContent {
  return {
    appraisal,
    photos: stream([]),
    company: { name: 'Norde Propiedades', logo: undefined },
    generatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

describe('PdfLibAppraisalReportRenderer', () => {
  const renderer = new PdfLibAppraisalReportRenderer();

  it('renders the result, the comparables and the photos as a valid PDF', async () => {
    const photos = await Promise.all([jpeg(), jpeg(600, 800), jpeg(4000, 3000)]);
    const bytes = await renderer.render(content({ photos: stream(photos) }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Tasación TAS0001');
    expect(doc.getAuthor()).toBe('Norde Propiedades');
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it('converts WebP photos and the logo, and skips files that are not images', async () => {
    const webp = new Uint8Array(
      await sharp({ create: { width: 400, height: 300, channels: 3, background: '#cc3366' } })
        .webp()
        .toBuffer(),
    );
    const logo = new Uint8Array(
      await sharp({ create: { width: 300, height: 100, channels: 4, background: '#00000000' } })
        .png()
        .toBuffer(),
    );
    const bytes = await renderer.render(
      content({
        photos: stream([webp, new Uint8Array([1, 2, 3])]),
        company: { name: 'Norde Propiedades', logo },
      }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('renders an appraisal without comparables, observations or photos', async () => {
    const bytes = await renderer.render(
      content({
        appraisal: {
          ...appraisal,
          address: undefined,
          appraiser: undefined,
          result: {
            sale: appraisal.result.sale,
            rent: undefined,
            comparables: [],
            observations: undefined,
          },
        },
      }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
