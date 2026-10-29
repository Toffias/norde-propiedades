import type { AppraisalSheetContent } from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { PANEL_PROPERTY_DETAIL } from '../panel-property-detail.fixture';

import { ReactPdfAppraisalSheetRenderer } from './appraisal-sheet-renderer';

function items(names: readonly string[]) {
  return names.map((name, index) => ({ name, checked: index % 2 === 0 }));
}

function content(overrides: Partial<AppraisalSheetContent> = {}): AppraisalSheetContent {
  return {
    property: PANEL_PROPERTY_DETAIL,
    address: 'Gurruchaga 1834 · Piso 3 Unidad B · Palermo, CABA',
    owners: [
      {
        name: 'Ana Pérez',
        phone: '+541148001111',
        mobile: '+5491166660000',
        email: 'ana@example.com',
      },
    ],
    features: {
      service: items(['Agua corriente', 'Gas natural', 'Luz', 'Cloaca', 'Internet']),
      room: items(['Balcón', 'Cocina', 'Lavadero', 'Living comedor', 'Patio', 'Terraza']),
      amenity: items(['Ascensor', 'Parrilla', 'Pileta', 'Quincho', 'SUM', 'Seguridad']),
    },
    company: { name: 'Norde Propiedades', logo: undefined, brandColor: '#c9302b' },
    generatedAt: new Date('2026-10-29T12:00:00Z'),
    ...overrides,
  };
}

async function render(overrides: Partial<AppraisalSheetContent> = {}) {
  const bytes = await new ReactPdfAppraisalSheetRenderer().render(content(overrides));
  return PDFDocument.load(bytes, { updateMetadata: false });
}

// Armar PDF de verdad (fuentes y varias pasadas de react-pdf) con el CI cargado pasa los 5 s por
// defecto, sobre todo el primero, que además carga react-pdf.
describe('ReactPdfAppraisalSheetRenderer', { timeout: 30_000 }, () => {
  it('fits the sheet of a typical catalog in a single portrait page', async () => {
    const pdf = await render();
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe('Planilla de tasación DEP0001');
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeLessThan(height);
  });

  it('prints without owners, catalog or loaded data', async () => {
    const pdf = await render({
      owners: [],
      features: { service: [], room: [], amenity: [] },
      property: {
        ...PANEL_PROPERTY_DETAIL,
        operations: [],
        producer: undefined,
        internal: { ...PANEL_PROPERTY_DETAIL.internal, appraisers: [], keysLocation: undefined },
      },
    });
    expect(pdf.getPageCount()).toBe(1);
  });

  it('flows onto another page when the catalog is long', async () => {
    const many = items(Array.from({ length: 40 }, (_, index) => `Ítem ${index.toString()}`));
    const pdf = await render({ features: { service: many, room: many, amenity: many } });
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
