import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../shared/testing';
import { PortalAccount } from '../domain/portal-account';
import { RemoteListingIdSchema } from '../contracts';
import {
  FakeListingSourceReader,
  FakePortalListingCatalog,
  FakePropertyCodeLookup,
  InMemoryPortalsUnitOfWork,
  LISTED_PROPERTY_ID,
  listingSource,
  remoteListing,
} from '../testing';
import { LinkPortalListing } from './commands/link-portal-listing';
import { ListRemoteListings } from './queries/list-remote-listings';

// Vincular los avisos que Tokko ya publicó en MercadoLibre (uno por operación), sin republicarlos.

const MANAGER = Actor.user('admin-1', ['portals:*']);
const AGENT = Actor.user('agent-1', ['portals:publish']);
const NOW = '2026-10-18T12:00:00.000Z';
const UNIT_ID = '01920000-0000-7000-8000-0000000000c9';
const DEVELOPMENT_ID = '01920000-0000-7000-8000-0000000000d9';
const SALE_ITEM = remoteListing({
  remoteId: 'MLA1592938055',
  code: 'MLA1592938055',
  reference: 'NHO1142594',
  operation: 'sale',
  listingType: 'featured',
  plan: undefined,
  permalink: 'https://inmueble.mercadolibre.com.ar/MLA-1592938055-venta-ph-_JM',
});
const LINK = {
  portal: 'mercadolibre',
  propertyId: LISTED_PROPERTY_ID,
  remoteId: 'https://inmueble.mercadolibre.com.ar/MLA-1592938055-venta-ph-mataderos-_JM',
} as const;

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  const account = PortalAccount.notConnected('mercadolibre');
  unwrap(
    account.connect(
      {
        externalAccountId: '3773207548',
        accountName: 'NORDE',
        connectedAt: new Date(NOW),
        connectedBy: 'u',
      },
      [],
      false,
    ),
  );
  unwrap(account.enable());
  uow.accounts.rows.set('mercadolibre', account.toSnapshot());
  const reader = new FakeListingSourceReader();
  reader.sources.set(LISTED_PROPERTY_ID, listingSource());
  const catalog = new FakePortalListingCatalog();
  catalog.listings = [SALE_ITEM];
  const clock = new FixedClock(NOW);
  return {
    uow,
    reader,
    catalog,
    link: new LinkPortalListing({ uow, catalog, reader, ids: new SequentialIdGenerator(), clock }),
    list: new ListRemoteListings({ uow, catalog, properties: new FakePropertyCodeLookup() }),
  };
}

describe('LinkPortalListing on MercadoLibre', () => {
  it('links the item to the publication of its operation, keeping its type', async () => {
    const { link, uow } = setup();

    const { listingId } = unwrap(await link.execute(LINK, AGENT));

    expect(uow.listings.rows.get(listingId)).toMatchObject({
      portal: 'mercadolibre',
      owner: { kind: 'property', id: LISTED_PROPERTY_ID },
      operation: 'sale',
      listingType: 'featured',
      plan: undefined,
      status: 'published',
      intent: 'active',
    });
    expect(uow.audit.entries[0]?.action).toBe('property.portal_listing_linked');
  });

  it('links a unit of a development as its own item', async () => {
    const { link, reader, uow } = setup();
    reader.sources.set(
      UNIT_ID,
      listingSource({ propertyId: UNIT_ID, code: 'AP7794303', developmentId: DEVELOPMENT_ID }),
    );

    const { listingId } = unwrap(await link.execute({ ...LINK, propertyId: UNIT_ID }, AGENT));

    expect(uow.listings.rows.get(listingId)?.owner).toEqual({ kind: 'property', id: UNIT_ID });
  });

  it('fails when MercadoLibre does not say the operation of the item', async () => {
    const { link, catalog } = setup();
    catalog.listings = [{ ...SALE_ITEM, operation: undefined }];
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({
      type: 'RemoteListingOperationUnknown',
    });
  });

  it('fails when the property does not offer the operation of the item', async () => {
    const { link, catalog } = setup();
    catalog.listings = [{ ...SALE_ITEM, operation: 'temporary_rent' }];
    expect(unwrapErr(await link.execute(LINK, AGENT))).toEqual({ type: 'OperationNotOffered' });
  });

  it('keeps one publication per operation, and refuses an item that is already linked', async () => {
    const { link } = setup();
    unwrap(await link.execute(LINK, AGENT));
    expect(unwrapErr(await link.execute(LINK, AGENT)).type).toBe('ListingAlreadyExists');
  });
});

describe('ListRemoteListings on MercadoLibre', () => {
  it('lists the items with their operation and the property of their reference', async () => {
    const { list } = setup();
    const page = unwrap(await list.execute({ portal: 'mercadolibre' }, MANAGER));
    expect(page.items[0]).toMatchObject({
      remoteId: 'MLA1592938055',
      operation: 'sale',
      match: { propertyId: LISTED_PROPERTY_ID, code: 'NHO1142594' },
    });
  });
});

describe('RemoteListingIdSchema', () => {
  it.each([
    ['https://inmueble.mercadolibre.com.ar/MLA-1592938055-venta-ph-_JM', 'MLA1592938055'],
    ['mla1592938055', 'MLA1592938055'],
    ['https://www.zonaprop.com.ar/propiedades/clasificado/-59617389.html', '59617389'],
    ['59617389', '59617389'],
  ])('reads %s as %s', (input, expected) => {
    expect(RemoteListingIdSchema.parse(input)).toBe(expected);
  });
});
