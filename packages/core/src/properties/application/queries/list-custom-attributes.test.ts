import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../../shared/testing';
import { StubPropertyCatalogQuery, TEST_MANAGER, TEST_OUTSIDER } from '../../testing';
import { ListCustomAttributes } from './list-custom-attributes';

describe('ListCustomAttributes', () => {
  it('pages the definitions in the database, by position by default', async () => {
    const catalog = new StubPropertyCatalogQuery();
    const page = unwrap(
      await new ListCustomAttributes({ catalog }).execute({ page: 2, pageSize: 10 }, TEST_MANAGER),
    );
    expect(page).toEqual({ items: [], total: 0, page: 2, pageSize: 10 });
    expect(catalog.calls).toContainEqual({
      method: 'listCustomAttributes',
      criteria: { sort: { field: 'position', direction: 'asc' }, offset: 10, limit: 10 },
    });
  });

  it('needs to see properties', async () => {
    const result = await new ListCustomAttributes({
      catalog: new StubPropertyCatalogQuery(),
    }).execute({}, TEST_OUTSIDER);
    expect(unwrapErr(result)).toEqual({ type: 'Forbidden' });
  });
});
