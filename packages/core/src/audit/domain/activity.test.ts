import { describe, expect, it } from 'vitest';

import { ACTIVITY_AREA_ENTITY_TYPES, activityAreaOf, activityEntityTypes } from './activity';

describe('activityAreaOf', () => {
  it('places each entity type in its area', () => {
    expect(activityAreaOf('property')).toBe('properties');
    expect(activityAreaOf('property_export')).toBe('properties');
    expect(activityAreaOf('client')).toBe('clients');
    expect(activityAreaOf('opportunity')).toBe('opportunities');
    expect(activityAreaOf('user')).toBe('users');
  });

  it('sends unknown entity types to other', () => {
    expect(activityAreaOf('branch')).toBe('other');
    expect(activityAreaOf('cash_movement')).toBe('other');
  });
});

describe('activityEntityTypes', () => {
  it('includes the types of an area', () => {
    expect(activityEntityTypes('appraisals')).toEqual({
      include: ['appraisal', 'appraisal_export'],
    });
  });

  it('excludes every listed type for other', () => {
    const filter = activityEntityTypes('other');
    expect(filter).toEqual({ exclude: Object.values(ACTIVITY_AREA_ENTITY_TYPES).flat() });
  });

  it('does not repeat an entity type across areas', () => {
    const all = Object.values(ACTIVITY_AREA_ENTITY_TYPES).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});
