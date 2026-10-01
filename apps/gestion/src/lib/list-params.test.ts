import { pageQuerySchema } from '@norde/core/shared/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseListParams, sortParam, withListParams } from './list-params';

const Schema = pageQuerySchema({
  sortable: ['name', 'createdAt'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
}).extend({ status: z.enum(['new', 'closed']).optional() });

describe('parseListParams', () => {
  it('parses the query params with the contract', () => {
    const parsed = parseListParams(Schema, {
      page: '2',
      pageSize: '50',
      sort: '-name',
      status: 'new',
    });

    expect(parsed).toEqual({
      value: { page: 2, pageSize: 50, sort: { field: 'name', direction: 'desc' }, status: 'new' },
      invalidKeys: [],
    });
  });

  it('drops the invalid params and keeps the valid ones', () => {
    const parsed = parseListParams(Schema, { page: '3', pageSize: '500', status: 'whatever' });

    expect(parsed.value).toEqual({
      page: 3,
      pageSize: 25,
      sort: { field: 'createdAt', direction: 'desc' },
    });
    expect([...parsed.invalidKeys].sort()).toEqual(['pageSize', 'status']);
  });

  it('ignores params the contract does not know', () => {
    expect(parseListParams(Schema, { utm_source: 'mail' }).invalidKeys).toEqual([]);
  });
});

describe('sortParam', () => {
  it('writes the format the sort schema reads', () => {
    expect(sortParam({ field: 'name', direction: 'asc' })).toBe('name');
    expect(sortParam({ field: 'name', direction: 'desc' })).toBe('-name');
    expect(Schema.parse({ sort: sortParam({ field: 'name', direction: 'desc' }) }).sort).toEqual({
      field: 'name',
      direction: 'desc',
    });
  });
});

describe('withListParams', () => {
  const current = new URLSearchParams('page=3&status=new&sort=-name');

  it('changes the page and keeps the rest', () => {
    expect(withListParams(current, { page: 4 })).toBe('?page=4&status=new&sort=-name');
  });

  it('drops page=1 to keep the URL clean', () => {
    expect(withListParams(current, { page: 1 })).toBe('?status=new&sort=-name');
  });

  it('goes back to the first page when a filter, the sort or the size changes', () => {
    expect(withListParams(current, { status: 'closed' })).toBe('?status=closed&sort=-name');
    expect(withListParams(current, { pageSize: 50 })).toBe('?status=new&sort=-name&pageSize=50');
  });

  it('removes a param set to empty or undefined', () => {
    expect(withListParams(current, { status: undefined, sort: '' })).toBe('');
  });

  it('writes multi-value filters as repeated params', () => {
    expect(withListParams(new URLSearchParams(), { channel: ['whatsapp', 'web_form'] })).toBe(
      '?channel=whatsapp&channel=web_form',
    );
  });
});
