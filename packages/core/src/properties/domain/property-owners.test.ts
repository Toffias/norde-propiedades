import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../shared/testing';
import { canAddOwner, canRemoveOwner, MAX_PROPERTY_OWNERS } from './property-owners';

describe('canAddOwner', () => {
  it('suma un propietario nuevo', () => {
    expect(unwrap(canAddOwner({ inTrash: false, alreadyOwner: false, count: 0 }))).toBe(true);
  });

  it('no cambia nada si ya era propietario, aunque esté en el tope', () => {
    expect(
      unwrap(canAddOwner({ inTrash: false, alreadyOwner: true, count: MAX_PROPERTY_OWNERS })),
    ).toBe(false);
  });

  it('no pasa del tope', () => {
    expect(
      unwrapErr(canAddOwner({ inTrash: false, alreadyOwner: false, count: MAX_PROPERTY_OWNERS })),
    ).toEqual({ type: 'TooManyOwners', max: MAX_PROPERTY_OWNERS });
  });

  it('no toca una propiedad en la papelera', () => {
    expect(unwrapErr(canAddOwner({ inTrash: true, alreadyOwner: false, count: 0 }))).toEqual({
      type: 'PropertyInTrash',
    });
  });
});

describe('canRemoveOwner', () => {
  it('quita un propietario', () => {
    expect(unwrap(canRemoveOwner({ inTrash: false, isOwner: true }))).toBe(true);
  });

  it('no cambia nada si no era propietario', () => {
    expect(unwrap(canRemoveOwner({ inTrash: false, isOwner: false }))).toBe(false);
  });

  it('no toca una propiedad en la papelera', () => {
    expect(unwrapErr(canRemoveOwner({ inTrash: true, isOwner: true }))).toEqual({
      type: 'PropertyInTrash',
    });
  });
});
