import { describe, expect, it } from 'vitest';

import {
  developmentsHref,
  developmentsTitle,
  isDevelopmentListIndexable,
  parseDevelopmentFilters,
  toDevelopmentSearchInput,
} from './listing-filters';

describe('parseDevelopmentFilters', () => {
  it('reads the type, construction status, sort and page from the URL', () => {
    expect(
      parseDevelopmentFilters({
        tipo: 'barrio-cerrado',
        obra: 'en-pozo',
        orden: 'entrega',
        pagina: '3',
      }),
    ).toEqual({
      developmentType: 'gated_community',
      constructionStatus: 'pre_sale',
      sort: 'delivery_asc',
      page: 3,
    });
  });

  it('ignores invalid values instead of failing', () => {
    expect(
      parseDevelopmentFilters({ tipo: 'castillo', obra: ['x'], orden: 'precio', pagina: '-1' }),
    ).toEqual({ sort: 'newest', page: 1 });
  });
});

describe('developmentsHref', () => {
  it('writes only the non-default values, back on page 1 when a filter changes', () => {
    const filters = parseDevelopmentFilters({ obra: 'terminado', pagina: '2' });
    expect(developmentsHref(filters)).toBe('/emprendimientos?obra=terminado');
    expect(developmentsHref(filters, { page: 2 })).toBe('/emprendimientos?obra=terminado&pagina=2');
    expect(developmentsHref(filters, { constructionStatus: undefined })).toBe('/emprendimientos');
    expect(developmentsHref(filters, { developmentType: 'lots', sort: 'delivery_asc' })).toBe(
      '/emprendimientos?tipo=loteo&obra=terminado&orden=entrega',
    );
  });
});

describe('toDevelopmentSearchInput', () => {
  it('passes the filters, sort and page to the use case', () => {
    expect(
      toDevelopmentSearchInput(parseDevelopmentFilters({ tipo: 'edificio', pagina: '2' }), 12),
    ).toEqual({ developmentType: 'building', sort: 'newest', page: 2, pageSize: 12 });
  });
});

describe('developmentsTitle', () => {
  it('names the listing after its filters', () => {
    expect(developmentsTitle(parseDevelopmentFilters({}))).toBe('Emprendimientos');
    expect(developmentsTitle(parseDevelopmentFilters({ obra: 'en-pozo', tipo: 'loteo' }))).toBe(
      'Emprendimientos en pozo · Loteo',
    );
  });
});

describe('isDevelopmentListIndexable', () => {
  it('does not index another sort of the same listing', () => {
    expect(isDevelopmentListIndexable(parseDevelopmentFilters({ obra: 'en-pozo' }))).toBe(true);
    expect(isDevelopmentListIndexable(parseDevelopmentFilters({ orden: 'entrega' }))).toBe(false);
  });
});
