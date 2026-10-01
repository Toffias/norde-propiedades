import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  bulkSelectionSchema,
  pageQuerySchema,
} from './pagination';

const ListSchema = pageQuerySchema({
  sortable: ['name', 'createdAt'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
}).extend({ status: z.enum(['active', 'archived']).optional() });

describe('pageQuerySchema', () => {
  it('applies the defaults when nothing is sent', () => {
    expect(ListSchema.parse({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: { field: 'createdAt', direction: 'desc' },
    });
  });

  it('coerces the strings that arrive from query params', () => {
    const parsed = ListSchema.parse({ page: '3', pageSize: '50', sort: 'name', status: 'active' });

    expect(parsed).toEqual({
      page: 3,
      pageSize: 50,
      sort: { field: 'name', direction: 'asc' },
      status: 'active',
    });
  });

  it('reads a leading minus as descending order', () => {
    expect(ListSchema.parse({ sort: '-name' }).sort).toEqual({ field: 'name', direction: 'desc' });
  });

  it('rejects a page size above the maximum instead of clamping it', () => {
    expect(ListSchema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false);
    expect(ListSchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('rejects pages and sizes below one and non integers', () => {
    expect(ListSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(ListSchema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(ListSchema.safeParse({ page: '1.5' }).success).toBe(false);
    expect(ListSchema.safeParse({ page: 'abc' }).success).toBe(false);
  });

  it('rejects columns outside the sort whitelist', () => {
    expect(ListSchema.safeParse({ sort: 'password' }).success).toBe(false);
    expect(ListSchema.safeParse({ sort: '--name' }).success).toBe(false);
    expect(ListSchema.safeParse({ sort: { field: 'password', direction: 'asc' } }).success).toBe(
      false,
    );
  });

  it('parses its own output again: the page parses the URL and the use case validates it', () => {
    const fromUrl = ListSchema.parse({ page: '2', sort: '-name', status: 'active' });

    expect(ListSchema.parse(fromUrl)).toEqual(fromUrl);
  });
});

describe('bulkSelectionSchema', () => {
  const SelectionSchema = bulkSelectionSchema(z.object({ status: z.string().optional() }));
  const uuid = '0192f3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b';

  it('accepts the ids selected on the page', () => {
    expect(SelectionSchema.parse({ kind: 'ids', ids: [uuid] })).toEqual({
      kind: 'ids',
      ids: [uuid],
    });
  });

  it('accepts every row that matches the filter', () => {
    expect(SelectionSchema.parse({ kind: 'filter', filter: { status: 'active' } })).toEqual({
      kind: 'filter',
      filter: { status: 'active' },
    });
  });

  it('rejects more ids than a page can hold, and an empty selection', () => {
    const tooMany = Array.from({ length: MAX_PAGE_SIZE + 1 }, () => uuid);

    expect(SelectionSchema.safeParse({ kind: 'ids', ids: tooMany }).success).toBe(false);
    expect(SelectionSchema.safeParse({ kind: 'ids', ids: [] }).success).toBe(false);
  });
});
