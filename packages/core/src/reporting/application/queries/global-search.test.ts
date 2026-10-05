import { describe, expect, it } from 'vitest';

import type { ClientListRow } from '../../../clients';
import type { UserListItem } from '../../../identity';
import type { DevelopmentRow, PanelPropertyRow } from '../../../properties';
import { Actor, err, ok, type Page, type Result } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { GLOBAL_SEARCH_LIMIT, type GlobalSearchKind } from '../../contracts';
import { GlobalSearch, type GlobalSearchSources } from './global-search';

const ACTOR = Actor.user('00000000-0000-7000-8000-0000000000a1', []);
const UPDATED_AT = new Date('2026-09-01T12:00:00Z');

const client = (overrides: Partial<ClientListRow> = {}): ClientListRow => ({
  id: 'client-1',
  kind: 'person',
  name: 'Lucía Gómez',
  companyName: 'Gómez SRL',
  phone: undefined,
  mobile: undefined,
  email: undefined,
  clientTypes: [],
  agent: undefined,
  contactMasked: false,
  createdAt: UPDATED_AT,
  updatedAt: UPDATED_AT,
  deletedAt: undefined,
  deletedBy: undefined,
  ...overrides,
});

const property = (overrides: Partial<PanelPropertyRow> = {}): PanelPropertyRow => ({
  id: 'property-1',
  code: 'NOR-0001',
  propertyType: 'apartment',
  status: 'available',
  portalTitle: 'Departamento 3 ambientes',
  publishAddress: 'Av. Siempreviva 742',
  floor: undefined,
  unit: undefined,
  developmentId: undefined,
  neighborhood: 'Palermo',
  city: 'CABA',
  province: 'Buenos Aires',
  operations: [],
  attributes: {
    rooms: undefined,
    bedrooms: undefined,
    bathrooms: undefined,
    parkingSpaces: undefined,
    ageYears: undefined,
    surfaceTotalM2: undefined,
    surfaceCoveredM2: undefined,
  },
  coverImageUrl: undefined,
  coordinates: undefined,
  producer: undefined,
  createdAt: UPDATED_AT,
  updatedAt: UPDATED_AT,
  deletedAt: undefined,
  deletedBy: undefined,
  ...overrides,
});

const development = (): DevelopmentRow => ({
  id: 'development-1',
  code: 'EMP-0001',
  name: 'Torre Norde',
  developmentType: undefined,
  status: 'marketing',
  constructionStatus: undefined,
  publishAddress: 'Calle 1 234',
  deliveryDate: undefined,
  websiteUrl: undefined,
  tags: [],
  unitCount: 12,
  updatedAt: UPDATED_AT,
  deletedAt: undefined,
  deletedBy: undefined,
});

const agent = (): UserListItem => ({
  id: 'user-1',
  name: 'Camila Pérez',
  email: 'camila@norde.com.ar',
  phone: undefined,
  status: 'active',
  branch: undefined,
  roles: [],
  mustChangePassword: false,
  lastLoginAt: undefined,
  createdAt: UPDATED_AT,
});

interface SearchCall {
  readonly kind: GlobalSearchKind;
  readonly input: unknown;
}

/** Fuente que devuelve siempre la misma página, o `Forbidden` si el actor no puede ver el tipo. */
function source<T>(
  kind: GlobalSearchKind,
  rows: readonly T[],
  calls: SearchCall[],
  forbidden: readonly GlobalSearchKind[],
) {
  return {
    execute(input: unknown): Promise<Result<Page<T>, { readonly type: 'Forbidden' }>> {
      calls.push({ kind, input });
      if (forbidden.includes(kind)) return Promise.resolve(err({ type: 'Forbidden' }));
      return Promise.resolve(
        ok({ items: rows, total: rows.length + 10, page: 1, pageSize: GLOBAL_SEARCH_LIMIT }),
      );
    },
  };
}

function setup(
  options: {
    readonly clients?: readonly ClientListRow[];
    readonly properties?: readonly PanelPropertyRow[];
    readonly forbidden?: readonly GlobalSearchKind[];
  } = {},
) {
  const calls: SearchCall[] = [];
  const forbidden = options.forbidden ?? [];
  const sources: GlobalSearchSources = {
    clients: source('clients', options.clients ?? [client()], calls, forbidden),
    properties: source('properties', options.properties ?? [property()], calls, forbidden),
    developments: source('developments', [development()], calls, forbidden),
    agents: source('agents', [agent()], calls, forbidden),
  };
  return { search: new GlobalSearch(sources), calls };
}

describe('GlobalSearch', () => {
  it('searches every kind when none is chosen', async () => {
    const { search, calls } = setup();

    const result = unwrap(await search.execute({ q: 'norde' }, ACTOR));

    expect(result.groups.map((group) => group.kind)).toEqual([
      'clients',
      'properties',
      'developments',
      'agents',
    ]);
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.input).toEqual({ q: 'norde', page: 1, pageSize: GLOBAL_SEARCH_LIMIT });
    }
  });

  it('searches only the chosen kinds, in a fixed order', async () => {
    const { search, calls } = setup();

    const result = unwrap(
      await search.execute({ q: 'norde', kinds: ['agents', 'clients'] }, ACTOR),
    );

    expect(result.groups.map((group) => group.kind)).toEqual(['clients', 'agents']);
    expect(calls.map((call) => call.kind).sort()).toEqual(['agents', 'clients']);
  });

  it('leaves out the kinds the actor cannot see', async () => {
    const { search } = setup({ forbidden: ['agents', 'developments'] });

    const result = unwrap(await search.execute({ q: 'norde' }, ACTOR));

    expect(result.groups.map((group) => group.kind)).toEqual(['clients', 'properties']);
  });

  it('returns no groups when the actor cannot see any chosen kind', async () => {
    const { search } = setup({ forbidden: ['agents'] });

    const result = unwrap(await search.execute({ q: 'norde', kinds: ['agents'] }, ACTOR));

    expect(result.groups).toEqual([]);
  });

  it('maps each row to a hit and keeps the total', async () => {
    const { search } = setup();

    const result = unwrap(await search.execute({ q: 'norde' }, ACTOR));

    expect(result.groups).toEqual([
      {
        kind: 'clients',
        total: 11,
        items: [{ id: 'client-1', code: undefined, title: 'Lucía Gómez', detail: 'Gómez SRL' }],
      },
      {
        kind: 'properties',
        total: 11,
        items: [
          {
            id: 'property-1',
            code: 'NOR-0001',
            title: 'Departamento 3 ambientes',
            detail: 'Av. Siempreviva 742',
          },
        ],
      },
      {
        kind: 'developments',
        total: 11,
        items: [
          { id: 'development-1', code: 'EMP-0001', title: 'Torre Norde', detail: 'Calle 1 234' },
        ],
      },
      {
        kind: 'agents',
        total: 11,
        items: [
          { id: 'user-1', code: undefined, title: 'Camila Pérez', detail: 'camila@norde.com.ar' },
        ],
      },
    ]);
  });

  it('titles a company by its name and a property without address by its location', async () => {
    const { search } = setup({
      clients: [client({ name: undefined, companyName: 'Gómez SRL' })],
      properties: [property({ publishAddress: undefined })],
    });

    const result = unwrap(
      await search.execute({ q: 'gomez', kinds: ['clients', 'properties'] }, ACTOR),
    );

    expect(result.groups[0]?.items[0]).toMatchObject({ title: 'Gómez SRL', detail: undefined });
    expect(result.groups[1]?.items[0]).toMatchObject({ detail: 'Palermo, CABA' });
  });

  it('does not repeat the location when the neighborhood and the city share a name', async () => {
    const { search } = setup({
      properties: [
        property({
          publishAddress: undefined,
          neighborhood: 'Lomas de Zamora',
          city: 'Lomas de Zamora',
        }),
      ],
    });

    const result = unwrap(await search.execute({ q: 'lomas', kinds: ['properties'] }, ACTOR));

    expect(result.groups[0]?.items[0]?.detail).toBe('Lomas de Zamora');
  });

  it('rejects a search shorter than two letters', async () => {
    const { search, calls } = setup();

    const error = unwrapErr(await search.execute({ q: ' a ' }, ACTOR));

    expect(error.type).toBe('InvalidInput');
    expect(calls).toEqual([]);
  });

  it('rejects an unknown kind', async () => {
    const { search } = setup();

    // @ts-expect-error: un tipo que no existe, como el que podría mandar un cliente manipulado.
    const error = unwrapErr(await search.execute({ q: 'norde', kinds: ['tasks'] }, ACTOR));

    expect(error.type).toBe('InvalidInput');
  });
});
