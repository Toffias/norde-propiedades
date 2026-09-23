import { OPERATIONS, PROPERTY_TYPES } from '@norde/core/properties/contracts';
import { describe, expect, it } from 'vitest';

import {
  OPERATION_OPTIONS,
  operationFromParam,
  PROPERTY_TYPE_OPTIONS,
  propertyTypeFromParam,
} from './search-params';

describe('search params', () => {
  it('covers every operation and property type of the core', () => {
    expect(OPERATION_OPTIONS.map((o) => o.value).sort()).toEqual([...OPERATIONS].sort());
    expect(PROPERTY_TYPE_OPTIONS.map((o) => o.value).sort()).toEqual([...PROPERTY_TYPES].sort());
  });

  it('uses unique URL values', () => {
    const params = [...OPERATION_OPTIONS, ...PROPERTY_TYPE_OPTIONS].map((o) => o.param);
    expect(new Set(params).size).toBe(params.length);
  });

  it('translates URL values to core values', () => {
    expect(operationFromParam('alquiler')).toBe('rent');
    expect(propertyTypeFromParam('departamento')).toBe('apartment');
    expect(operationFromParam('otra')).toBeUndefined();
    expect(propertyTypeFromParam(undefined)).toBeUndefined();
  });
});
