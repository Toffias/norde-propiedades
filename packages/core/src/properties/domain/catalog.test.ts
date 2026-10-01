import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';
import {
  FEATURE_KIND_VALUES,
  GRID_COLUMN_VALUES,
  LOCATION_KIND_VALUES,
  MANUAL_STATUS_VALUES,
  MAX_GRID_COLUMN_COUNT,
  PROPERTY_ATTRIBUTE_GROUP_OF,
  PROPERTY_ATTRIBUTE_GROUP_VALUES,
  PROPERTY_ATTRIBUTE_VALUES,
} from '../contracts';
import { FEATURE_KINDS, Feature, featureKey } from './feature';
import {
  DEFAULT_GRID_COLUMNS,
  GRID_COLUMN_OPTIONS,
  MAX_GRID_COLUMNS,
  chooseGridColumns,
} from './grid-columns';
import { LOCATION_KINDS, Location, childKind } from './location';
import { PropertyTag, TagGroup } from './property-tag';
import { MANUAL_STATUSES, canTransition } from './property-status';
import {
  PROPERTY_ATTRIBUTE_GROUP,
  PROPERTY_ATTRIBUTE_GROUPS,
  PROPERTY_ATTRIBUTE_KEYS,
  RECOMMENDED_ATTRIBUTES,
  changeTypeSetting,
  defaultTypeSetting,
  ensureTypeEnabled,
  type PropertyTypeSetting,
} from './property-type-settings';
import { PROPERTY_KINDS } from './property-catalog';

const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');
const id = <B extends string>(suffix: string) =>
  unwrap(parseId<B>(`00000000-0000-7000-8000-${suffix.padStart(12, '0')}`));

describe('catalog values', () => {
  it('matches the lists the contracts offer to the forms', () => {
    expect([...LOCATION_KIND_VALUES]).toEqual([...LOCATION_KINDS]);
    expect([...FEATURE_KIND_VALUES]).toEqual([...FEATURE_KINDS]);
    expect([...PROPERTY_ATTRIBUTE_VALUES]).toEqual([...PROPERTY_ATTRIBUTE_KEYS]);
    expect([...PROPERTY_ATTRIBUTE_GROUP_VALUES]).toEqual([...PROPERTY_ATTRIBUTE_GROUPS]);
    expect(PROPERTY_ATTRIBUTE_GROUP_OF).toEqual(PROPERTY_ATTRIBUTE_GROUP);
    expect([...GRID_COLUMN_VALUES]).toEqual([...GRID_COLUMN_OPTIONS]);
    expect(MAX_GRID_COLUMN_COUNT).toBe(MAX_GRID_COLUMNS);
    expect([...MANUAL_STATUS_VALUES]).toEqual([...MANUAL_STATUSES]);
  });
});

describe('Location', () => {
  it('takes the level below its parent and extends its path', () => {
    const country = unwrap(
      Location.create({
        id: id<'Location'>('1'),
        name: ' Argentina ',
        parent: undefined,
        now: NOW,
      }),
    ).toSnapshot();
    expect(country).toMatchObject({ kind: 'country', name: 'Argentina', path: `/${country.id}/` });

    const province = unwrap(
      Location.create({
        id: id<'Location'>('2'),
        name: 'CABA',
        parent: { id: country.id, kind: country.kind, path: country.path },
        now: NOW,
      }),
    ).toSnapshot();
    expect(province).toMatchObject({
      kind: 'province',
      parentId: country.id,
      path: `/${country.id}/${province.id}/`,
    });
  });

  it('does not go below a subneighborhood', () => {
    expect(childKind('neighborhood')).toBe('subneighborhood');
    expect(
      unwrapErr(
        Location.create({
          id: id<'Location'>('3'),
          name: 'Más abajo',
          parent: { id: id<'Location'>('9'), kind: 'subneighborhood', path: '/9/' },
          now: NOW,
        }),
      ),
    ).toEqual({ type: 'LocationTooDeep' });
  });

  it('renames with clean spacing', () => {
    const location = unwrap(
      Location.create({ id: id<'Location'>('1'), name: 'Palermo', parent: undefined, now: NOW }),
    );
    location.rename('  Palermo   Viejo ', LATER);
    expect(location.toSnapshot()).toMatchObject({ name: 'Palermo Viejo', updatedAt: LATER });
  });
});

describe('Feature', () => {
  it('builds a stable key from the kind and the name, without accents', () => {
    expect(featureKey('amenity', 'Pileta climatizada')).toBe('amenity-pileta-climatizada');
    expect(featureKey('service', 'Calefacción  central')).toBe('service-calefaccion-central');
  });

  it('keeps its key when renamed and can be turned off', () => {
    const feature = Feature.create({
      id: id<'Feature'>('1'),
      kind: 'amenity',
      name: 'Pileta',
      key: 'amenity-pileta',
      position: 3,
      now: NOW,
    });
    feature.update({ name: 'Piscina', isActive: false }, LATER);
    expect(feature.toSnapshot()).toMatchObject({
      key: 'amenity-pileta',
      name: 'Piscina',
      isActive: false,
      position: 3,
    });
  });
});

describe('tags', () => {
  it('renames a group and moves a tag between groups', () => {
    const group = TagGroup.create({
      id: id<'PropertyTagGroup'>('1'),
      name: 'Campañas',
      position: 0,
      now: NOW,
    });
    group.rename(' Campañas 2027 ', LATER);
    expect(group.name).toBe('Campañas 2027');

    const tag = PropertyTag.create({
      id: id<'PropertyTag'>('2'),
      groupId: undefined,
      name: 'Apto mascotas',
      now: NOW,
    });
    tag.update({ name: 'Apto mascotas', groupId: group.id }, LATER);
    expect(tag.toSnapshot()).toMatchObject({ groupId: group.id, updatedAt: LATER });
  });
});

describe('property type settings', () => {
  const all = (overrides: Partial<Record<string, boolean>> = {}): PropertyTypeSetting[] =>
    PROPERTY_KINDS.map((kind) => ({
      ...defaultTypeSetting(kind),
      isEnabled: overrides[kind] ?? true,
    }));

  it('recommends no bedrooms for land and garages', () => {
    expect(RECOMMENDED_ATTRIBUTES.land).not.toContain('bedrooms');
    expect(RECOMMENDED_ATTRIBUTES.garage).not.toContain('bedrooms');
    expect(RECOMMENDED_ATTRIBUTES.house).toContain('surfaceLandM2');
    expect(defaultTypeSetting('office')).toMatchObject({ isEnabled: true });
  });

  it('keeps the attributes in canonical order without repeats', () => {
    const setting = unwrap(
      changeTypeSetting(all(), {
        kind: 'apartment',
        isEnabled: true,
        visibleAttributes: ['surfaceTotalM2', 'rooms', 'rooms'],
      }),
    );
    expect(setting.visibleAttributes).toEqual(['rooms', 'surfaceTotalM2']);
  });

  it('does not let the company disable every type', () => {
    const onlyHouse = all(
      Object.fromEntries(PROPERTY_KINDS.map((kind) => [kind, kind === 'house'])),
    );
    expect(
      unwrapErr(
        changeTypeSetting(onlyHouse, { kind: 'house', isEnabled: false, visibleAttributes: [] }),
      ),
    ).toEqual({ type: 'NoPropertyTypeEnabled' });
    expect(
      changeTypeSetting(onlyHouse, {
        kind: 'land',
        isEnabled: false,
        visibleAttributes: [],
      }).isOk(),
    ).toBe(true);
  });

  it('rejects a disabled type at creation', () => {
    expect(
      unwrapErr(ensureTypeEnabled({ ...defaultTypeSetting('garage'), isEnabled: false })),
    ).toEqual({ type: 'PropertyTypeDisabled' });
  });
});

describe('grid columns', () => {
  it('keeps the chosen order without repeats', () => {
    expect(unwrap(chooseGridColumns(['producer', 'rooms', 'producer']))).toEqual([
      'producer',
      'rooms',
    ]);
    expect(DEFAULT_GRID_COLUMNS.length).toBeLessThanOrEqual(MAX_GRID_COLUMNS);
  });

  it('allows at most four extra columns', () => {
    expect(
      unwrapErr(chooseGridColumns(['rooms', 'bedrooms', 'bathrooms', 'ageYears', 'producer'])),
    ).toEqual({ type: 'TooManyGridColumns', max: 4 });
  });
});

describe('status transitions', () => {
  it('moves a draft to available but not straight to sold', () => {
    expect(canTransition('draft', 'available')).toBe(true);
    expect(canTransition('draft', 'sold')).toBe(false);
  });

  it('relists a sold or rented property and takes back a withdrawn one', () => {
    expect(canTransition('sold', 'available')).toBe(true);
    expect(canTransition('rented', 'available')).toBe(true);
    expect(canTransition('withdrawn', 'draft')).toBe(true);
    expect(canTransition('paused', 'sold')).toBe(false);
  });

  it('leaves "reserved" to the reservations', () => {
    expect(MANUAL_STATUSES).not.toContain('reserved');
  });
});
