import { describe, expect, it } from 'vitest';

import { PUBLICATION_BUCKET_VALUES } from '../contracts';
import {
  PUBLICATION_BUCKETS,
  publicationCriteria,
  publicationTier,
  tallyPublications,
} from './publication-buckets';

describe('publication buckets', () => {
  it('matches the values of the contract', () => {
    expect([...PUBLICATION_BUCKETS]).toEqual([...PUBLICATION_BUCKET_VALUES]);
  });
});

describe('publicationTier', () => {
  it('is featured by its listing type (MercadoLibre)', () => {
    expect(publicationTier('featured', undefined)).toBe('featured');
    expect(publicationTier('simple', undefined)).toBe('simple');
  });

  it('is featured by any plan but SIMPLE (Zonaprop)', () => {
    expect(publicationTier('simple', 'SIMPLE')).toBe('simple');
    expect(publicationTier('simple', 'HOME')).toBe('featured');
    expect(publicationTier('simple', 'SUPERDESTACADO')).toBe('featured');
  });
});

describe('publicationCriteria', () => {
  it('splits the published listings by tier', () => {
    expect(publicationCriteria('published')).toEqual({
      kind: 'listed',
      statuses: ['published'],
      tier: undefined,
      portalPaused: undefined,
    });
    expect(publicationCriteria('featured')).toMatchObject({
      statuses: ['published'],
      tier: 'featured',
    });
    expect(publicationCriteria('simple')).toMatchObject({
      statuses: ['published'],
      tier: 'simple',
    });
  });

  it('tells the listings paused by the portal from the ones paused by the team', () => {
    expect(publicationCriteria('review')).toMatchObject({
      statuses: ['paused'],
      portalPaused: true,
    });
    expect(publicationCriteria('paused')).toMatchObject({
      statuses: ['paused'],
      portalPaused: false,
    });
  });

  it('looks for the errors, the pending and what is missing', () => {
    expect(publicationCriteria('error')).toMatchObject({ statuses: ['error'] });
    expect(publicationCriteria('pending')).toMatchObject({ statuses: ['pending'] });
    expect(publicationCriteria('missing')).toEqual({ kind: 'missing' });
  });
});

describe('tallyPublications', () => {
  const tally = (
    status: string,
    count: number,
    extra: { listingType?: string; plan?: string; hasReason?: boolean } = {},
  ) => ({
    status,
    listingType: extra.listingType ?? 'simple',
    plan: extra.plan,
    hasReason: extra.hasReason ?? false,
    count,
  });

  it('folds the aggregates into the counters', () => {
    expect(
      tallyPublications(
        [
          tally('published', 5),
          tally('published', 2, { listingType: 'featured' }),
          tally('published', 3, { plan: 'HOME' }),
          tally('published', 1, { plan: 'SIMPLE' }),
          tally('pending', 4),
          tally('paused', 6),
          tally('paused', 7, { hasReason: true }),
          tally('error', 8),
        ],
        9,
      ),
    ).toEqual({
      published: 11,
      simple: 6,
      featured: 5,
      pending: 4,
      paused: 6,
      review: 7,
      error: 8,
      missing: 9,
    });
  });

  it('ignores the unpublished listings', () => {
    expect(tallyPublications([tally('unpublished', 3)], 0)).toMatchObject({
      published: 0,
      paused: 0,
      error: 0,
    });
  });
});
