import { describe, expect, it } from 'vitest';

import type { Post, Redirect } from '../../payload-types';
import { redirectDestination } from './redirects';

const redirect = (to: NonNullable<Redirect['to']>): Redirect => ({
  id: 1,
  from: '/blog/viejo',
  to,
  updatedAt: '2026-09-22T00:00:00.000Z',
  createdAt: '2026-09-22T00:00:00.000Z',
});

const post: Post = {
  id: 7,
  title: 'Nuevo',
  slug: 'nuevo',
  heroImage: 1,
  authors: [1],
  content: {
    root: { type: 'root', children: [], direction: null, format: '', indent: 0, version: 1 },
  },
  updatedAt: '2026-09-22T00:00:00.000Z',
  createdAt: '2026-09-22T00:00:00.000Z',
};

describe('redirectDestination', () => {
  it('points to the referenced post', () => {
    expect(
      redirectDestination(
        redirect({ type: 'reference', reference: { relationTo: 'posts', value: post } }),
      ),
    ).toBe('/blog/nuevo');
  });

  it('ignores a reference that was not populated', () => {
    expect(
      redirectDestination(
        redirect({ type: 'reference', reference: { relationTo: 'posts', value: 7 } }),
      ),
    ).toBeNull();
  });

  it('accepts site paths and absolute http(s) URLs', () => {
    expect(redirectDestination(redirect({ type: 'custom', url: '/blog' }))).toBe('/blog');
    expect(redirectDestination(redirect({ type: 'custom', url: 'https://norde.com.ar/x' }))).toBe(
      'https://norde.com.ar/x',
    );
  });

  it('rejects dangerous or protocol-relative URLs', () => {
    for (const url of ['javascript:alert(1)', '//evil.com', 'evil.com']) {
      expect(redirectDestination(redirect({ type: 'custom', url }))).toBeNull();
    }
  });
});
