import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { StubPublicationOverviewQuery } from '../../testing';
import { GetPublicationOverview } from './get-publication-overview';
import { ListPortalPublications } from './list-portal-publications';

const USER_ID = '00000000-0000-7000-8000-0000000000a1';
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000d1';

const PUBLISHER = Actor.user(USER_ID, ['portals:publish']);
const MANAGER = Actor.user(USER_ID, ['portals:manage']);
const NOBODY = Actor.user(USER_ID, ['properties:read']);

const ZERO = {
  published: 0,
  simple: 0,
  featured: 0,
  pending: 0,
  paused: 0,
  review: 0,
  error: 0,
  missing: 0,
};

describe('GetPublicationOverview', () => {
  const query = () =>
    new StubPublicationOverviewQuery({
      enabled: ['zonaprop', 'mercadolibre'],
      properties: { available: 40, onWeb: 35 },
      developments: { available: 4, onWeb: 3 },
      tallies: [
        {
          portal: 'mercadolibre',
          kind: 'property',
          publishedOwners: 12,
          tallies: [
            {
              status: 'published',
              listingType: 'simple',
              plan: undefined,
              hasReason: false,
              count: 10,
            },
            {
              status: 'published',
              listingType: 'featured',
              plan: undefined,
              hasReason: false,
              count: 4,
            },
            { status: 'paused', listingType: 'simple', plan: undefined, hasReason: true, count: 2 },
          ],
        },
        {
          portal: 'zonaprop',
          kind: 'development',
          publishedOwners: 1,
          tallies: [
            {
              status: 'published',
              listingType: 'simple',
              plan: 'DESARROLLOS_HOME',
              hasReason: false,
              count: 1,
            },
          ],
        },
      ],
      missing: { 'mercadolibre:property': 26, 'zonaprop:property': 40, 'zonaprop:development': 3 },
    });

  it('counts what is available and each enabled portal, in the catalog order', async () => {
    const overview = unwrap(
      await new GetPublicationOverview({ publications: query() }).execute({}, PUBLISHER),
    );

    expect(overview.properties).toEqual({ available: 40, onWeb: 35 });
    expect(overview.developments).toEqual({ available: 4, onWeb: 3 });
    expect(overview.portals.map((p) => p.portal)).toEqual(['mercadolibre', 'zonaprop']);
    expect(overview.portals[0]?.kinds).toEqual([
      {
        kind: 'property',
        publishedOwners: 12,
        counts: { ...ZERO, published: 14, simple: 10, featured: 4, review: 2, missing: 26 },
      },
    ]);
    expect(overview.portals[1]?.kinds).toEqual([
      { kind: 'property', publishedOwners: 0, counts: { ...ZERO, missing: 40 } },
      {
        kind: 'development',
        publishedOwners: 1,
        counts: { ...ZERO, published: 1, featured: 1, missing: 3 },
      },
    ]);
  });

  it('only asks what is missing for what each account publishes', async () => {
    const publications = query();
    await new GetPublicationOverview({ publications }).execute({}, MANAGER);

    expect(publications.missingAsked).toEqual([
      { portal: 'mercadolibre', kind: 'property' },
      { portal: 'zonaprop', kind: 'property' },
      { portal: 'zonaprop', kind: 'development' },
    ]);
  });

  it('shows no portal when none is enabled', async () => {
    const overview = unwrap(
      await new GetPublicationOverview({
        publications: new StubPublicationOverviewQuery(),
      }).execute({}, PUBLISHER),
    );
    expect(overview.portals).toEqual([]);
  });

  it('is forbidden without the portals permissions', async () => {
    const result = await new GetPublicationOverview({ publications: query() }).execute({}, NOBODY);
    expect(unwrapErr(result)).toEqual({ type: 'Forbidden' });
  });
});

describe('ListPortalPublications', () => {
  const row = {
    owner: { kind: 'property' as const, id: PROPERTY_ID, code: 'NOR123', title: 'Depto 2 amb' },
    listing: undefined,
    updatedAt: new Date('2026-10-20T12:00:00Z'),
  };

  it('pages the listings behind a counter with the domain criteria', async () => {
    const publications = new StubPublicationOverviewQuery({ rows: [row, row, row] });
    const page = unwrap(
      await new ListPortalPublications({ publications }).execute(
        { portal: 'mercadolibre', kind: 'property', bucket: 'review', page: 2, pageSize: 2 },
        PUBLISHER,
      ),
    );

    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
    expect(publications.requests[0]).toMatchObject({
      portal: 'mercadolibre',
      kind: 'property',
      criteria: { kind: 'listed', statuses: ['paused'], portalPaused: true },
      publishable: { property: 'available', development: 'marketing' },
      sort: { field: 'updatedAt', direction: 'desc' },
      offset: 2,
      limit: 2,
    });
  });

  it('lists the published ones by default and what is missing on request', async () => {
    const publications = new StubPublicationOverviewQuery();
    const list = new ListPortalPublications({ publications });
    await list.execute({ portal: 'zonaprop', kind: 'development' }, MANAGER);
    await list.execute({ portal: 'zonaprop', kind: 'property', bucket: 'missing' }, MANAGER);

    expect(publications.requests.map((r) => r.criteria)).toEqual([
      { kind: 'listed', statuses: ['published'], tier: undefined, portalPaused: undefined },
      { kind: 'missing' },
    ]);
  });

  it('rejects a kind the account does not publish', async () => {
    const result = await new ListPortalPublications({
      publications: new StubPublicationOverviewQuery(),
    }).execute({ portal: 'mercadolibre_developments', kind: 'property' }, PUBLISHER);
    expect(unwrapErr(result)).toEqual({ type: 'PortalKindNotPublished' });
  });

  it('rejects an unknown counter', async () => {
    const result = await new ListPortalPublications({
      publications: new StubPublicationOverviewQuery(),
    }).execute(
      // @ts-expect-error: a hand-edited URL can carry any value
      { portal: 'zonaprop', kind: 'property', bucket: 'premium' },
      PUBLISHER,
    );
    expect(unwrapErr(result).type).toBe('InvalidInput');
  });

  it('is forbidden without the portals permissions', async () => {
    const result = await new ListPortalPublications({
      publications: new StubPublicationOverviewQuery(),
    }).execute({ portal: 'zonaprop', kind: 'property' }, NOBODY);
    expect(unwrapErr(result)).toEqual({ type: 'Forbidden' });
  });
});
