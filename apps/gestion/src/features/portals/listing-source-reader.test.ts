import type { BranchDetail } from '@norde/core/identity/contracts';
import type { PanelPropertyDetail, ShareablePhoto } from '@norde/core/properties/contracts';
import type { CompanySettingsView } from '@norde/core/settings/contracts';
import { Actor, err, ok } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import {
  listingSourceReader,
  PORTAL_PHOTO_LIMIT,
  PORTAL_PHOTO_SECONDS,
} from './listing-source-reader';

const PROPERTY_ID = '01920000-0000-7000-8000-0000000000b1';
const BRANCH_ID = '01920000-0000-7000-8000-0000000000c1';
const ACTOR = Actor.system('portal-sync', ['properties:read', 'settings:read', 'branches:read']);

// Solo los campos que lee el lector; el resto de la ficha no importa acá.
const DETAIL = {
  id: PROPERTY_ID,
  code: 'DEP0001',
  slug: 'departamento-palermo-dep0001',
  propertyType: 'apartment',
  status: 'available',
  address: {
    street: 'Gurruchaga',
    streetNumber: '1834',
    floor: '4',
    unit: 'B',
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
  },
  publishAddress: 'Gurruchaga al 1800',
  portalTitle: 'Departamento en venta en Palermo',
  description: 'Luminoso.',
  locationPath: [
    { id: 'l1', name: 'Argentina', kind: 'country' },
    { id: 'l2', name: 'Capital Federal', kind: 'province' },
    { id: 'l3', name: 'Palermo', kind: 'neighborhood' },
  ],
  coordinates: { latitude: -34.58, longitude: -58.43 },
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
    ageYears: 10,
    orientation: 'north',
    condition: undefined,
    disposition: 'front',
    isFurnished: false,
    professionalUse: true,
    surfaceTotalM2: 70,
    surfaceCoveredM2: 65,
    surfaceSemiCoveredM2: undefined,
    surfaceLandM2: undefined,
    frontM: undefined,
    depthM: undefined,
  },
  deal: {
    isExclusive: false,
    acceptsSwap: false,
    immediateDeed: false,
    hasFinancing: false,
    creditEligible: true,
    expensesCents: 8_000_000n,
  },
  branchId: BRANCH_ID,
  development: undefined,
  deletedAt: undefined,
} as unknown as PanelPropertyDetail; // Ficha recortada: el lector usa solo estos campos.

const BRANCH: BranchDetail = {
  id: BRANCH_ID,
  name: 'Casa central',
  logoUrl: undefined,
  address: undefined,
  email: 'ventas@norde.test',
  phone: '+541148000000',
  whatsapp: '+5491166000000',
  isMain: true,
  deletedAt: undefined,
};

const PHOTOS: ShareablePhoto[] = [
  { mediaId: 'm1', version: '2026-10-01T00:00:00.000Z', url: 'https://signed/1' },
];

function setup(
  options: {
    detail?: PanelPropertyDetail;
    footer?: string;
    webTemplate?: string;
    missing?: boolean;
  } = {},
) {
  const photoCalls: unknown[] = [];
  const reader = listingSourceReader({
    propertyDetail: {
      execute: () =>
        Promise.resolve(
          options.missing ? err({ type: 'PropertyNotFound' }) : ok(options.detail ?? DETAIL),
        ),
    },
    photos: {
      execute: (input) => {
        photoCalls.push(input);
        return Promise.resolve(ok(PHOTOS));
      },
    },
    companySettings: {
      execute: () =>
        Promise.resolve(
          ok({
            portalDescriptionFooter: options.footer,
            webPropertyUrlTemplate: options.webTemplate,
          } as unknown as CompanySettingsView), // Mi empresa recortada: solo el pie y la URL de la web.
        ),
    },
    branch: { execute: () => Promise.resolve(ok(BRANCH)) },
    actor: ACTOR,
  });
  return { reader, photoCalls };
}

describe('listingSourceReader', () => {
  it('builds what a portal publishes from the property, its photos and its branch', async () => {
    const { reader, photoCalls } = setup();

    const source = await reader.read(PROPERTY_ID);

    expect(source).toMatchObject({
      propertyId: PROPERTY_ID,
      code: 'DEP0001',
      kind: 'apartment',
      availability: 'active',
      developmentId: undefined,
      title: 'Departamento en venta en Palermo',
      description: 'Luminoso.',
      address: 'Gurruchaga al 1800',
      location: { province: 'Capital Federal', city: 'CABA', neighborhood: 'Palermo' },
      photos: [{ id: 'm1', version: '2026-10-01T00:00:00.000Z', url: 'https://signed/1' }],
      contact: {
        name: 'Casa central',
        email: 'ventas@norde.test',
        phone: '+541148000000',
        whatsapp: '+5491166000000',
      },
    });
    expect(photoCalls).toEqual([
      {
        propertyId: PROPERTY_ID,
        expiresInSeconds: PORTAL_PHOTO_SECONDS,
        limit: PORTAL_PHOTO_LIMIT,
      },
    ]);
  });

  it('never publishes the floor or the unit', async () => {
    const { reader } = setup();
    const source = await reader.read(PROPERTY_ID);
    expect(
      JSON.stringify(source, (_k, v: unknown) => (typeof v === 'bigint' ? String(v) : v)),
    ).not.toContain('1834');
  });

  it('adds the company footer with the branch contact and the web link', async () => {
    const { reader } = setup({
      footer: 'Código {codigo}. WhatsApp {whatsapp_sucursal}. {url_web}',
      webTemplate: 'https://norde.test/propiedades/{slug}',
    });
    const source = await reader.read(PROPERTY_ID);
    expect(source?.description).toBe(
      'Luminoso.\n\nCódigo DEP0001. WhatsApp +5491166000000. https://norde.test/propiedades/departamento-palermo-dep0001',
    );
  });

  it('maps a reserved property to paused and a trashed one to closed', async () => {
    const reserved = setup({ detail: { ...DETAIL, status: 'reserved' } });
    expect((await reserved.reader.read(PROPERTY_ID))?.availability).toBe('paused');
    const trashed = setup({ detail: { ...DETAIL, deletedAt: new Date('2026-10-01T00:00:00Z') } });
    expect((await trashed.reader.read(PROPERTY_ID))?.availability).toBe('closed');
  });

  it('returns nothing for an unknown property', async () => {
    const { reader } = setup({ missing: true });
    expect(await reader.read(PROPERTY_ID)).toBeUndefined();
  });
});
