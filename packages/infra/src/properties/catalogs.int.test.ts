import {
  CustomAttribute,
  FavoriteSearch,
  Feature,
  Location,
  PropertyTag,
  TagGroup,
  type LocationParent,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { properties, propertyTagAssignments } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import {
  DrizzleCustomAttributeRepository,
  DrizzleFavoriteSearchRepository,
  DrizzleFeatureRepository,
  DrizzleLocationRepository,
  DrizzlePropertySettingsRepository,
  DrizzlePropertyTypeSettingsRepository,
  DrizzleTagGroupRepository,
  DrizzleTagRepository,
} from './drizzle-catalog-repositories';
import { DrizzlePropertyCatalogQuery } from './drizzle-property-catalog-query';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const catalog = new DrizzlePropertyCatalogQuery(db);
const NOW = new Date('2026-10-01T12:00:00Z');
const ADMIN = '00000000-0000-7000-8000-0000000000e1';
const PAGE = { offset: 0, limit: 25 } as const;

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

function id<Brand extends string>() {
  return unwrap(parseId<Brand>(ids.next()));
}

describe('locations', () => {
  const repository = new DrizzleLocationRepository(db);

  async function add(name: string, parent?: Location): Promise<Location> {
    const s = parent?.toSnapshot();
    const parentRef: LocationParent | undefined =
      s === undefined ? undefined : { id: s.id, kind: s.kind, path: s.path };
    const location = unwrap(
      Location.create({ id: id<'Location'>(), name, parent: parentRef, now: NOW }),
    );
    await repository.save(location, ADMIN);
    return location;
  }

  it('saves the tree, finds siblings without accents and walks the lineage', async () => {
    const argentina = await add('Argentina');
    const cordoba = await add('Córdoba', argentina);
    const city = await add('Córdoba', cordoba);
    const centro = await add('Nueva Córdoba', city);

    expect((await repository.findSibling(argentina.id, 'CORDOBA'))?.id).toBe(cordoba.id);
    expect(await repository.findSibling(undefined, 'Córdoba')).toBeUndefined();
    expect((await repository.findLineage(centro.id)).map((l) => l.name)).toEqual([
      'Argentina',
      'Córdoba',
      'Córdoba',
      'Nueva Córdoba',
    ]);
    expect((await repository.findById(centro.id))?.toSnapshot()).toEqual(centro.toSnapshot());
  });

  it('rejects two locations with the same name under the same parent', async () => {
    const argentina = await add('Argentina');
    await add('Salta', argentina);
    await expect(add('salta', argentina)).rejects.toThrow();
  });

  it('searches by name with the names of the ancestors, by parent and by level', async () => {
    const argentina = await add('Argentina');
    const caba = await add('CABA', argentina);
    const cabaCity = await add('CABA', caba);
    await add('Palermo', cabaCity);
    await add('Parque Patricios', cabaCity);

    const found = await catalog.searchLocations({
      ...PAGE,
      text: 'palérmo',
      parentId: undefined,
      kind: undefined,
      direction: 'asc',
    });
    expect(found.items).toEqual([
      expect.objectContaining({
        name: 'Palermo',
        kind: 'neighborhood',
        ancestors: ['Argentina', 'CABA', 'CABA'],
      }),
    ]);

    const children = await catalog.searchLocations({
      ...PAGE,
      text: undefined,
      parentId: cabaCity.id,
      kind: 'neighborhood',
      direction: 'desc',
    });
    expect(children.items.map((l) => l.name)).toEqual(['Parque Patricios', 'Palermo']);
    expect(children.total).toBe(2);
  });
});

describe('features', () => {
  const repository = new DrizzleFeatureRepository(db);

  async function add(kind: 'service' | 'amenity', name: string, position: number) {
    const feature = Feature.create({
      id: id<'Feature'>(),
      kind,
      name,
      key: `${kind}-${name.toLowerCase().replace(/\s+/g, '-')}`,
      position,
      now: NOW,
    });
    await repository.save(feature, ADMIN);
    return feature;
  }

  it('finds by key and by name, and knows the next position of each kind', async () => {
    await add('amenity', 'Pileta', 0);
    const parrilla = await add('amenity', 'Parrilla', 1);
    await add('service', 'Gas natural', 0);

    expect((await repository.findByName('amenity', 'PARRILLA'))?.id).toBe(parrilla.id);
    expect(await repository.findByName('service', 'Parrilla')).toBeUndefined();
    expect((await repository.findByKey('amenity-pileta'))?.name).toBe('Pileta');
    expect(await repository.nextPosition('amenity')).toBe(2);
    expect(await repository.nextPosition('room')).toBe(0);
  });

  it('lists a kind by position or name, with text and state filters', async () => {
    await add('amenity', 'Pileta', 0);
    const sauna = await add('amenity', 'Sauna', 1);
    await add('amenity', 'Parrilla', 2);
    sauna.update({ name: 'Sauna', isActive: false }, NOW);
    await repository.save(sauna, ADMIN);

    const byPosition = await catalog.listFeatures({
      ...PAGE,
      kind: 'amenity',
      text: undefined,
      active: undefined,
      sort: { field: 'position', direction: 'asc' },
    });
    expect(byPosition.items.map((f) => f.name)).toEqual(['Pileta', 'Sauna', 'Parrilla']);

    const active = await catalog.listFeatures({
      ...PAGE,
      kind: 'amenity',
      text: 'p',
      active: true,
      sort: { field: 'name', direction: 'asc' },
    });
    expect(active.items.map((f) => f.name)).toEqual(['Parrilla', 'Pileta']);
  });
});

describe('tags', () => {
  const groups = new DrizzleTagGroupRepository(db);
  const tags = new DrizzleTagRepository(db);

  it('counts tags per group and uses per tag, and deletes them', async () => {
    const group = TagGroup.create({
      id: id<'PropertyTagGroup'>(),
      name: 'Campañas',
      position: 0,
      now: NOW,
    });
    await groups.save(group, ADMIN);
    const tag = PropertyTag.create({
      id: id<'PropertyTag'>(),
      groupId: group.id,
      name: 'Verano',
      now: NOW,
    });
    const loose = PropertyTag.create({
      id: id<'PropertyTag'>(),
      groupId: undefined,
      name: 'Suelta',
      now: NOW,
    });
    await tags.save(tag, ADMIN);
    await tags.save(loose, ADMIN);

    const propertyId = ids.next();
    await db.insert(properties).values({
      id: propertyId,
      code: 'DEP0001',
      slug: 'dep0001',
      title: 'Departamento',
      operation: 'sale',
      propertyType: 'apartment',
      status: 'draft',
      neighborhood: 'Palermo',
      city: 'CABA',
      province: 'CABA',
      currency: 'USD',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db
      .insert(propertyTagAssignments)
      .values({ propertyId, tagId: tag.id, createdAt: NOW, createdBy: ADMIN });

    expect((await groups.findByName('CAMPANAS'))?.id).toBe(group.id);
    expect(await groups.countTags(group.id)).toBe(1);
    expect(await tags.countUses(tag.id)).toBe(1);
    expect((await tags.findInGroup(group.id, 'verano'))?.id).toBe(tag.id);
    expect(await tags.findInGroup(undefined, 'verano')).toBeUndefined();
    expect(await tags.findExistingIds([tag.id, ids.next()])).toEqual([tag.id]);

    const listed = await catalog.listTagGroups({
      ...PAGE,
      text: 'campana',
      sort: { field: 'name', direction: 'asc' },
    });
    expect(listed.items).toEqual([expect.objectContaining({ name: 'Campañas', tagCount: 1 })]);

    const searched = await catalog.searchTags({
      ...PAGE,
      text: 'ver',
      groupId: undefined,
      direction: 'asc',
    });
    expect(searched.items).toEqual([
      expect.objectContaining({ name: 'Verano', groupName: 'Campañas', uses: 1 }),
    ]);
    const withoutGroup = await catalog.searchTags({
      ...PAGE,
      text: undefined,
      groupId: null,
      direction: 'asc',
    });
    expect(withoutGroup.items.map((t) => t.name)).toEqual(['Suelta']);

    await tags.delete(loose.id);
    expect(await tags.findById(loose.id)).toBeUndefined();
  });
});

describe('configuration', () => {
  it('defaults every type to the recommended settings and saves a change', async () => {
    const repository = new DrizzlePropertyTypeSettingsRepository(db);
    expect((await repository.all()).every((s) => s.isEnabled)).toBe(true);

    await repository.save(
      { kind: 'land', isEnabled: false, visibleAttributes: ['frontM', 'depthM'] },
      ADMIN,
      NOW,
    );

    expect(await repository.find('land')).toEqual({
      kind: 'land',
      isEnabled: false,
      visibleAttributes: ['frontM', 'depthM'],
    });
    expect((await catalog.typeSettings()).find((s) => s.kind === 'land')?.isEnabled).toBe(false);
  });

  it('saves the grid columns in the single settings row', async () => {
    const repository = new DrizzlePropertySettingsRepository(db);
    expect(await repository.gridColumns()).toEqual([]);
    await repository.saveGridColumns(['producer', 'rooms'], ADMIN, NOW);
    expect(await catalog.gridColumns()).toEqual(['producer', 'rooms']);
  });
});

describe('favorite searches', () => {
  const repository = new DrizzleFavoriteSearchRepository(db);
  const USER = '00000000-0000-7000-8000-0000000000e2';
  const OTHER_USER = '00000000-0000-7000-8000-0000000000e3';

  it('keeps each user searches apart, by name and by last update', async () => {
    const palermo = FavoriteSearch.create({
      id: id<'FavoriteSearch'>(),
      userId: USER,
      name: 'Palermo',
      params: { location: 'Palermo', operation: 'sale' },
      now: NOW,
    });
    await repository.save(palermo, USER);
    await repository.save(
      FavoriteSearch.create({
        id: id<'FavoriteSearch'>(),
        userId: USER,
        name: 'Alquileres',
        params: {},
        now: NOW,
      }),
      USER,
    );
    await repository.save(
      FavoriteSearch.create({
        id: id<'FavoriteSearch'>(),
        userId: OTHER_USER,
        name: 'Palermo',
        params: {},
        now: NOW,
      }),
      OTHER_USER,
    );

    expect(await repository.countByUser(USER)).toBe(2);
    expect((await repository.findByName(USER, 'PALERMO'))?.toSnapshot().params).toEqual({
      location: 'Palermo',
      operation: 'sale',
    });

    const listed = await catalog.listFavoriteSearches({
      ...PAGE,
      userId: USER,
      sort: { field: 'name', direction: 'asc' },
    });
    expect(listed.items.map((s) => s.name)).toEqual(['Alquileres', 'Palermo']);
    expect(listed.total).toBe(2);

    await repository.delete(palermo.id);
    expect(await repository.countByUser(USER)).toBe(1);
  });
});

describe('custom attributes', () => {
  const repository = new DrizzleCustomAttributeRepository(db);

  it('round-trips a definition, finds it by name without accents and by IDs', async () => {
    const view = unwrap(
      CustomAttribute.create({
        id: id<'CustomAttribute'>(),
        name: 'Vista al río',
        kind: 'select',
        options: ['Total', 'Parcial'],
        position: await repository.nextPosition(),
        now: NOW,
      }),
    );
    await repository.save(view, ADMIN);
    const pets = unwrap(
      CustomAttribute.create({
        id: id<'CustomAttribute'>(),
        name: 'Acepta mascotas',
        kind: 'boolean',
        options: [],
        position: await repository.nextPosition(),
        now: NOW,
      }),
    );
    await repository.save(pets, ADMIN);

    expect((await repository.findById(view.id))?.toSnapshot()).toEqual(view.toSnapshot());
    expect((await repository.findByName('VISTA AL RÍO'))?.id).toBe(view.id);
    expect(pets.toSnapshot().position).toBe(1);
    expect((await repository.findByIds([pets.id, view.id])).map((a) => a.id).sort()).toEqual(
      [pets.id, view.id].sort(),
    );

    unwrap(view.update({ name: 'Vista', options: ['Total'], isActive: false }, NOW));
    await repository.save(view, ADMIN);
    expect((await repository.findById(view.id))?.toSnapshot()).toMatchObject({
      name: 'Vista',
      options: ['Total'],
      isActive: false,
    });
  });
});
