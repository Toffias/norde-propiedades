import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { MAX_FAVORITE_SEARCHES } from '../../domain/favorite-search';
import { InMemoryPropertiesUnitOfWork, TEST_NOW, TEST_OUTSIDER } from '../../testing';
import { CreateFeature } from './create-feature';
import { CreateLocation } from './create-location';
import { CreateTag } from './create-tag';
import { CreateTagGroup } from './create-tag-group';
import { DeleteFavoriteSearch } from './delete-favorite-search';
import { DeleteTag } from './delete-tag';
import { DeleteTagGroup } from './delete-tag-group';
import { RenameLocation } from './rename-location';
import { RenameTagGroup } from './rename-tag-group';
import { SaveFavoriteSearch } from './save-favorite-search';
import { UpdateFeature } from './update-feature';
import { UpdateGridColumns } from './update-grid-columns';
import { UpdatePropertyTypeSetting } from './update-property-type-setting';
import { UpdateTag } from './update-tag';

const ADMIN_ID = '00000000-0000-7000-8000-0000000000e1';
const AGENT_ID = '00000000-0000-7000-8000-0000000000e2';
const ADMIN = Actor.user(ADMIN_ID, ['settings:update', 'tags:update', 'properties:read']);
/** Ve propiedades, pero no configura nada. */
const AGENT = Actor.user(AGENT_ID, ['properties:read']);
const UNKNOWN_ID = '00000000-0000-7000-8000-0000000000ff';

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  const ids = new SequentialIdGenerator();
  const clock = new FixedClock(TEST_NOW);
  return {
    uow,
    clock,
    createLocation: new CreateLocation({ uow, ids, clock }),
    renameLocation: new RenameLocation({ uow, clock }),
    createFeature: new CreateFeature({ uow, ids, clock }),
    updateFeature: new UpdateFeature({ uow, clock }),
    createGroup: new CreateTagGroup({ uow, ids, clock }),
    renameGroup: new RenameTagGroup({ uow, clock }),
    deleteGroup: new DeleteTagGroup({ uow }),
    createTag: new CreateTag({ uow, ids, clock }),
    updateTag: new UpdateTag({ uow, clock }),
    deleteTag: new DeleteTag({ uow }),
    updateType: new UpdatePropertyTypeSetting({ uow, clock }),
    updateColumns: new UpdateGridColumns({ uow, clock }),
    saveSearch: new SaveFavoriteSearch({ uow, ids, clock }),
    deleteSearch: new DeleteFavoriteSearch({ uow }),
  };
}

describe('locations', () => {
  it('builds the hierarchy level by level and audits each one', async () => {
    const { uow, createLocation } = setup();
    const { locationId: country } = unwrap(
      await createLocation.execute({ name: 'Argentina' }, ADMIN),
    );
    const { locationId: province } = unwrap(
      await createLocation.execute({ parentId: country, name: 'Córdoba' }, ADMIN),
    );

    expect(uow.locations.rows.get(province)).toMatchObject({
      kind: 'province',
      parentId: country,
      path: `/${country}/${province}/`,
    });
    expect(uow.audit.entries.map((e) => [e.action, e.entityType, e.entityId])).toEqual([
      ['location.created', 'location', country],
      ['location.created', 'location', province],
    ]);
    expect(uow.audit.entries[1]?.changes).toEqual({
      name: { before: null, after: 'Córdoba' },
      kind: { before: null, after: 'province' },
      parentId: { before: null, after: country },
    });
  });

  it('rejects a repeated name under the same parent, ignoring accents and case', async () => {
    const { createLocation } = setup();
    const { locationId } = unwrap(await createLocation.execute({ name: 'Argentina' }, ADMIN));
    unwrap(await createLocation.execute({ parentId: locationId, name: 'Córdoba' }, ADMIN));
    expect(
      unwrapErr(await createLocation.execute({ parentId: locationId, name: 'cordoba' }, ADMIN)),
    ).toEqual({ type: 'LocationNameTaken' });
  });

  it('rejects an unknown parent and an actor without permission', async () => {
    const { createLocation } = setup();
    expect(
      unwrapErr(await createLocation.execute({ parentId: UNKNOWN_ID, name: 'X' }, ADMIN)),
    ).toEqual({ type: 'LocationNotFound' });
    expect(unwrapErr(await createLocation.execute({ name: 'Uruguay' }, AGENT))).toEqual({
      type: 'Forbidden',
    });
  });

  it('renames a location and audits only the name', async () => {
    const { uow, createLocation, renameLocation } = setup();
    const { locationId } = unwrap(await createLocation.execute({ name: 'Argentina' }, ADMIN));
    unwrap(await renameLocation.execute({ locationId, name: 'República Argentina' }, ADMIN));
    unwrap(await renameLocation.execute({ locationId, name: 'República Argentina' }, ADMIN));

    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'location.created',
      'location.updated',
    ]);
    expect(uow.audit.entries[1]?.changes).toEqual({
      name: { before: 'Argentina', after: 'República Argentina' },
    });
    expect(
      unwrapErr(await renameLocation.execute({ locationId: UNKNOWN_ID, name: 'X' }, ADMIN)),
    ).toEqual({ type: 'LocationNotFound' });
  });
});

describe('features', () => {
  it('adds an item at the end of its kind with a stable key', async () => {
    const { uow, createFeature } = setup();
    unwrap(await createFeature.execute({ kind: 'amenity', name: 'Pileta' }, ADMIN));
    const { featureId } = unwrap(
      await createFeature.execute({ kind: 'amenity', name: 'Parrilla' }, ADMIN),
    );
    expect(uow.features.rows.get(featureId)).toMatchObject({
      key: 'amenity-parrilla',
      position: 1,
      isActive: true,
    });
    expect(uow.audit.entries[1]).toMatchObject({ kind: 'created', action: 'feature.created' });
  });

  it('rejects a repeated name in the same kind but not in another', async () => {
    const { createFeature } = setup();
    unwrap(await createFeature.execute({ kind: 'room', name: 'Lavadero' }, ADMIN));
    expect(
      unwrapErr(await createFeature.execute({ kind: 'room', name: 'lavadero' }, ADMIN)),
    ).toEqual({ type: 'FeatureNameTaken' });
    expect((await createFeature.execute({ kind: 'service', name: 'Lavadero' }, ADMIN)).isOk()).toBe(
      true,
    );
  });

  it('gives a new item another key when a renamed one kept it', async () => {
    const { uow, createFeature, updateFeature } = setup();
    const { featureId } = unwrap(
      await createFeature.execute({ kind: 'amenity', name: 'Pileta' }, ADMIN),
    );
    unwrap(await updateFeature.execute({ featureId, name: 'Piscina', isActive: true }, ADMIN));
    const second = unwrap(await createFeature.execute({ kind: 'amenity', name: 'Pileta' }, ADMIN));
    expect(uow.features.rows.get(second.featureId)?.key).toBe('amenity-pileta-1');
  });

  it('deactivates an item and audits the change', async () => {
    const { uow, createFeature, updateFeature } = setup();
    const { featureId } = unwrap(
      await createFeature.execute({ kind: 'service', name: 'Gas natural' }, ADMIN),
    );
    unwrap(await updateFeature.execute({ featureId, name: 'Gas natural', isActive: false }, ADMIN));
    expect(uow.audit.entries[1]?.changes).toEqual({ isActive: { before: true, after: false } });
    expect(
      unwrapErr(
        await updateFeature.execute({ featureId, name: 'Gas natural', isActive: true }, AGENT),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('tags', () => {
  it('creates groups and tags, and moves a tag between groups', async () => {
    const { uow, createGroup, createTag, updateTag } = setup();
    const { groupId } = unwrap(await createGroup.execute({ name: 'Documentación' }, ADMIN));
    const { tagId } = unwrap(await createTag.execute({ name: 'Escritura al día' }, ADMIN));
    unwrap(await updateTag.execute({ tagId, groupId, name: 'Escritura al día' }, ADMIN));

    expect(uow.tags.rows.get(tagId)).toMatchObject({ groupId });
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'property_tag.updated',
      changes: { groupId: { before: null, after: groupId } },
    });
  });

  it('rejects repeated names and unknown groups', async () => {
    const { createGroup, renameGroup, createTag } = setup();
    const { groupId } = unwrap(await createGroup.execute({ name: 'Campañas' }, ADMIN));
    const other = unwrap(await createGroup.execute({ name: 'Otras' }, ADMIN));
    expect(unwrapErr(await createGroup.execute({ name: 'campañas' }, ADMIN))).toEqual({
      type: 'TagGroupNameTaken',
    });
    expect(
      unwrapErr(await renameGroup.execute({ groupId: other.groupId, name: 'Campañas' }, ADMIN)),
    ).toEqual({ type: 'TagGroupNameTaken' });
    unwrap(await createTag.execute({ groupId, name: 'Verano' }, ADMIN));
    expect(unwrapErr(await createTag.execute({ groupId, name: 'VERANO' }, ADMIN))).toEqual({
      type: 'TagNameTaken',
    });
    expect((await createTag.execute({ name: 'Verano' }, ADMIN)).isOk()).toBe(true);
    expect(unwrapErr(await createTag.execute({ groupId: UNKNOWN_ID, name: 'X' }, ADMIN))).toEqual({
      type: 'TagGroupNotFound',
    });
  });

  it('deletes only empty groups and unused tags, keeping how they were in the audit', async () => {
    const { uow, createGroup, createTag, deleteGroup, deleteTag } = setup();
    const { groupId } = unwrap(await createGroup.execute({ name: 'Campañas' }, ADMIN));
    const { tagId } = unwrap(await createTag.execute({ groupId, name: 'Verano' }, ADMIN));

    expect(unwrapErr(await deleteGroup.execute({ groupId }, ADMIN))).toEqual({
      type: 'TagGroupNotEmpty',
    });
    uow.tags.uses.set(tagId, 3);
    expect(unwrapErr(await deleteTag.execute({ tagId }, ADMIN))).toEqual({
      type: 'TagInUse',
      uses: 3,
    });

    uow.tags.uses.delete(tagId);
    unwrap(await deleteTag.execute({ tagId }, ADMIN));
    unwrap(await deleteGroup.execute({ groupId }, ADMIN));
    expect(uow.tags.rows.size).toBe(0);
    expect(uow.tagGroups.rows.size).toBe(0);
    expect(uow.audit.entries.slice(-2)).toMatchObject([
      {
        kind: 'action',
        action: 'property_tag.deleted',
        changes: { name: { before: 'Verano', after: null } },
      },
      { kind: 'action', action: 'property_tag_group.deleted' },
    ]);
  });

  it('needs tags:update', async () => {
    const { createGroup } = setup();
    expect(unwrapErr(await createGroup.execute({ name: 'X' }, AGENT))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('property type settings', () => {
  it('disables a type and audits the change', async () => {
    const { uow, updateType } = setup();
    unwrap(
      await updateType.execute(
        { propertyType: 'garage', isEnabled: false, visibleAttributes: ['surfaceTotalM2'] },
        ADMIN,
      ),
    );
    expect(uow.typeSettings.rows.get('garage')).toEqual({
      kind: 'garage',
      isEnabled: false,
      visibleAttributes: ['surfaceTotalM2'],
    });
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property_type_setting.updated',
      entityId: 'garage',
      changes: { isEnabled: { before: true, after: false } },
    });
  });

  it('does not disable the last enabled type', async () => {
    const { uow, updateType } = setup();
    for (const kind of [
      'apartment',
      'ph',
      'land',
      'office',
      'commercial',
      'garage',
      'warehouse',
    ] as const) {
      uow.typeSettings.rows.set(kind, { kind, isEnabled: false, visibleAttributes: [] });
    }
    expect(
      unwrapErr(
        await updateType.execute(
          { propertyType: 'house', isEnabled: false, visibleAttributes: [] },
          ADMIN,
        ),
      ),
    ).toEqual({ type: 'NoPropertyTypeEnabled' });
    expect(uow.audit.entries).toEqual([]);
  });

  it('needs settings:update', async () => {
    const { updateType } = setup();
    expect(
      unwrapErr(
        await updateType.execute(
          { propertyType: 'house', isEnabled: true, visibleAttributes: [] },
          AGENT,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('grid columns', () => {
  it('saves the chosen columns and audits them', async () => {
    const { uow, updateColumns } = setup();
    unwrap(await updateColumns.execute({ columns: ['rooms', 'producer'] }, ADMIN));
    expect(await uow.settings.gridColumns()).toEqual(['rooms', 'producer']);
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property_settings.updated',
      changes: { gridColumns: { before: [], after: ['rooms', 'producer'] } },
    });
  });

  it('rejects more than four columns and actors without permission', async () => {
    const { updateColumns } = setup();
    expect(
      unwrapErr(
        await updateColumns.execute(
          { columns: ['rooms', 'bedrooms', 'bathrooms', 'ageYears', 'producer'] },
          ADMIN,
        ),
      ).type,
    ).toBe('InvalidInput');
    expect(unwrapErr(await updateColumns.execute({ columns: [] }, AGENT))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('favorite searches', () => {
  it('saves the filters for the user, and replaces them when the name repeats', async () => {
    const { uow, saveSearch } = setup();
    const { searchId } = unwrap(
      await saveSearch.execute(
        { name: 'Palermo en venta', params: { operation: 'sale', location: 'Palermo', q: '' } },
        AGENT,
      ),
    );
    expect(uow.favoriteSearches.rows.get(searchId)).toMatchObject({
      userId: AGENT_ID,
      params: { operation: 'sale', location: 'Palermo' },
    });

    const again = unwrap(
      await saveSearch.execute(
        { name: 'palermo en venta', params: { operation: 'rent', location: 'Palermo' } },
        AGENT,
      ),
    );
    expect(again.searchId).toBe(searchId);
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'favorite_search.created',
      'favorite_search.updated',
    ]);
  });

  it('only saves filters the search accepts', async () => {
    const { saveSearch } = setup();
    expect(
      unwrapErr(await saveSearch.execute({ name: 'Caras', params: { minPrice: '100000' } }, AGENT))
        .type,
    ).toBe('InvalidInput');
  });

  it('limits how many searches a user keeps', async () => {
    const { uow, saveSearch } = setup();
    for (let i = 0; i < MAX_FAVORITE_SEARCHES; i += 1) {
      unwrap(await saveSearch.execute({ name: `Búsqueda ${i}`, params: {} }, AGENT));
    }
    expect(unwrapErr(await saveSearch.execute({ name: 'Una más', params: {} }, AGENT))).toEqual({
      type: 'TooManyFavoriteSearches',
      max: MAX_FAVORITE_SEARCHES,
    });
    expect(uow.favoriteSearches.rows.size).toBe(MAX_FAVORITE_SEARCHES);
  });

  it('deletes only the searches of the user who asks', async () => {
    const { uow, saveSearch, deleteSearch } = setup();
    const { searchId } = unwrap(await saveSearch.execute({ name: 'Mías', params: {} }, AGENT));
    expect(unwrapErr(await deleteSearch.execute({ searchId }, ADMIN))).toEqual({
      type: 'FavoriteSearchNotFound',
    });
    unwrap(await deleteSearch.execute({ searchId }, AGENT));
    expect(uow.favoriteSearches.rows.size).toBe(0);
    expect(uow.audit.entries.at(-1)).toMatchObject({ action: 'favorite_search.deleted' });
  });

  it('needs properties:read', async () => {
    const { saveSearch } = setup();
    expect(unwrapErr(await saveSearch.execute({ name: 'X', params: {} }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});
