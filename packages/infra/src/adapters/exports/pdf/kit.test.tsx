import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  PdfDocument,
  PdfFields,
  PdfItems,
  PdfKeyFacts,
  PdfPage,
  PdfPhoto,
  PdfPriceTag,
  PdfSection,
  PdfTextSection,
} from './kit';
import { renderPdf } from './render';

const BRANDING = {
  logo: undefined,
  companyName: 'Norde Propiedades',
  contactLine: 'Av. Siempreviva 742 · Tel. (011) 4000-0000',
};

const PARAGRAPH =
  'Casa de cinco ambientes en lote propio, con quincho, parrilla y terraza. Living comedor con salida al patio y cocina integrada con isla. Ideal para quienes buscan espacios generosos.';

async function photo(): Promise<Uint8Array> {
  const jpeg = await sharp({
    create: { width: 320, height: 200, channels: 3, background: '#c9302b' },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(jpeg);
}

async function sheet(description: string, orientation: 'portrait' | 'landscape') {
  const image = await photo();
  return renderPdf(
    <PdfDocument meta={{ title: 'Ficha NHO0001', author: 'Norde Propiedades' }}>
      <PdfPage branding={BRANDING} orientation={orientation} footerNote="Medidas aproximadas.">
        <PdfPriceTag operation="Venta" amount="USD 370.000" />
        <PdfKeyFacts
          facts={[
            { icon: 'rooms', text: '5 amb.' },
            { icon: 'bedrooms', text: '4 dorm.' },
            { icon: 'bathrooms', text: '3 baños' },
            { icon: 'surface', text: '193 m²' },
          ]}
        />
        <PdfPhoto bytes={image} width={240} height={150} />
        <PdfSection title="Información general" keepTogether>
          <PdfFields
            fields={[
              { label: 'Ambientes', value: '5' },
              { label: 'Antigüedad', value: '30 años' },
              { label: 'Orientación', value: 'Oeste' },
            ]}
          />
        </PdfSection>
        <PdfSection title="Servicios" keepTogether>
          <PdfItems items={['Electricidad', 'Gas natural', 'Agua corriente']} />
        </PdfSection>
        <PdfTextSection title="Descripción" text={description} />
      </PdfPage>
    </PdfDocument>,
  );
}

describe('pdf kit', () => {
  it('renders an A4 page with metadata, embedded fonts and extractable text', async () => {
    const bytes = await sheet(PARAGRAPH, 'portrait');
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });

    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    expect(pdf.getTitle()).toBe('Ficha NHO0001');
    expect(pdf.getAuthor()).toBe('Norde Propiedades');
    const raw = Buffer.from(bytes).toString('latin1');
    expect(raw).toContain('PlusJakartaSans');
    // Con ToUnicode el texto se puede copiar y buscar (los PDF de Tokko lo dibujan como trazos).
    expect(raw).toContain('/ToUnicode');
  });

  it('flows a long description onto more pages instead of cutting it', async () => {
    const long = Array.from({ length: 40 }, () => PARAGRAPH).join('\n\n');
    const bytes = await sheet(long, 'landscape');
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });

    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([842, 595]);
  });
});
