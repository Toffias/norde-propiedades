import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  StubClientTagQuery,
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OUTSIDER,
} from '../../testing';
import { ListClientTagGroups } from '../queries/list-client-tag-groups';
import { SearchClientTags } from '../queries/search-client-tags';

import { ChangeClientTags } from './change-client-tags';
import { CreateClientTag } from './create-client-tag';
import { CreateClientTagGroup } from './create-client-tag-group';
import { DeleteClientTag } from './delete-client-tag';
import { DeleteClientTagGroup } from './delete-client-tag-group';
import { MergeClientTags } from './merge-client-tags';
import { RenameClientTagGroup } from './rename-client-tag-group';
import { UpdateClientTag } from './update-client-tag';

const clock = new FixedClock('2026-03-10T12:00:00Z');
/** Quien administra las etiquetas: "Editar etiquetas". */
const EDITOR = Actor.user('00000000-0000-7000-8000-0000000000c5', ['tags:update', 'clients:read']);
const MISSING = '00000000-0000-7000-8000-0000000000ff';

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const ids = new SequentialIdGenerator();
  const deps = { uow, ids, clock };
  return {
    uow,
    createGroup: new CreateClientTagGroup(deps),
    renameGroup: new RenameClientTagGroup(deps),
    deleteGroup: new DeleteClientTagGroup(deps),
    createTag: new CreateClientTag(deps),
    updateTag: new UpdateClientTag(deps),
    deleteTag: new DeleteClientTag(deps),
    mergeTags: new MergeClientTags(deps),
    changeTags: new ChangeClientTags(deps),
  };
}

describe('client tag catalog', () => {
  it('creates a group and a tag inside it, audited without client data', async () => {
    const { uow, createGroup, createTag } = setup();

    const { groupId } = unwrap(await createGroup.execute({ name: 'Origen' }, EDITOR));
    const { tagId } = unwrap(await createTag.execute({ groupId, name: 'Zonaprop' }, EDITOR));

    expect(uow.tagGroups.rows.get(groupId)).toMatchObject({ name: 'Origen', position: 0 });
    expect(uow.tags.rows.get(tagId)).toMatchObject({ name: 'Zonaprop', groupId });
    expect(uow.audit.entries.map((e) => [e.action, e.clientIds])).toEqual([
      ['client_tag_group.created', []],
      ['client_tag.created', []],
    ]);
    expect(uow.audit.entries[1]?.changes).toEqual({
      name: { before: null, after: 'Zonaprop' },
      groupId: { before: null, after: groupId },
    });
  });

  it('does not repeat a group or a tag name in the same group', async () => {
    const { createGroup, createTag } = setup();
    const { groupId } = unwrap(await createGroup.execute({ name: 'Origen' }, EDITOR));
    unwrap(await createTag.execute({ groupId, name: 'Zonaprop' }, EDITOR));

    expect(unwrapErr(await createGroup.execute({ name: 'origen' }, EDITOR))).toEqual({
      type: 'TagGroupNameTaken',
    });
    expect(unwrapErr(await createTag.execute({ groupId, name: 'ZONAPROP' }, EDITOR))).toEqual({
      type: 'TagNameTaken',
    });
    // Sin grupo es otro espacio de nombres.
    expect(unwrap(await createTag.execute({ name: 'Zonaprop' }, EDITOR)).tagId).toBeDefined();
    expect(unwrapErr(await createTag.execute({ groupId: MISSING, name: 'X' }, EDITOR))).toEqual({
      type: 'TagGroupNotFound',
    });
  });

  it('renames a group and moves a tag to another group, auditing only what changed', async () => {
    const { uow, createGroup, renameGroup, createTag, updateTag } = setup();
    const { groupId } = unwrap(await createGroup.execute({ name: 'Origen' }, EDITOR));
    const other = unwrap(await createGroup.execute({ name: 'Colegas' }, EDITOR));
    const { tagId } = unwrap(await createTag.execute({ groupId, name: 'Zonaprop' }, EDITOR));

    unwrap(await renameGroup.execute({ groupId, name: 'Origen web' }, EDITOR));
    unwrap(await updateTag.execute({ tagId, groupId: other.groupId, name: 'Zonaprop' }, EDITOR));
    unwrap(await renameGroup.execute({ groupId, name: 'Origen web' }, EDITOR));

    expect(uow.tags.rows.get(tagId)?.groupId).toBe(other.groupId);
    expect(uow.audit.entries.slice(3).map((e) => [e.action, e.changes])).toEqual([
      ['client_tag_group.updated', { name: { before: 'Origen', after: 'Origen web' } }],
      ['client_tag.updated', { groupId: { before: groupId, after: other.groupId } }],
    ]);
  });

  it('deletes an empty group and an unused tag; not one in use', async () => {
    const { uow, createGroup, createTag, deleteGroup, deleteTag, changeTags } = setup();
    const { groupId } = unwrap(await createGroup.execute({ name: 'Origen' }, EDITOR));
    const { tagId } = unwrap(await createTag.execute({ groupId, name: 'Zonaprop' }, EDITOR));
    const client = await seedClient(uow);
    unwrap(await changeTags.execute({ clientId: client.id, tagIds: [tagId] }, TEST_AGENT));

    expect(unwrapErr(await deleteGroup.execute({ groupId }, EDITOR))).toEqual({
      type: 'TagGroupNotEmpty',
    });
    expect(unwrapErr(await deleteTag.execute({ tagId }, EDITOR))).toEqual({
      type: 'TagInUse',
      uses: 1,
    });

    unwrap(await changeTags.execute({ clientId: client.id, tagIds: [] }, TEST_AGENT));
    unwrap(await deleteTag.execute({ tagId }, EDITOR));
    unwrap(await deleteGroup.execute({ groupId }, EDITOR));

    expect(uow.tags.rows.size).toBe(0);
    expect(uow.tagGroups.rows.size).toBe(0);
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'client_tag_group.deleted',
      changes: { name: { before: 'Origen', after: null } },
    });
  });

  it('merges a tag into another: contacts keep one and the source is deleted', async () => {
    const { uow, createTag, changeTags, mergeTags } = setup();
    const source = unwrap(await createTag.execute({ name: 'Zona prop' }, EDITOR)).tagId;
    const target = unwrap(await createTag.execute({ name: 'Zonaprop' }, EDITOR)).tagId;
    const onlySource = await seedClient(uow);
    const both = await seedClient(uow, { phones: ['+541147770001'] });
    unwrap(await changeTags.execute({ clientId: onlySource.id, tagIds: [source] }, TEST_AGENT));
    unwrap(await changeTags.execute({ clientId: both.id, tagIds: [source, target] }, TEST_AGENT));

    const result = unwrap(
      await mergeTags.execute({ sourceTagId: source, targetTagId: target }, EDITOR),
    );

    expect(result).toEqual({ moved: 2 });
    expect(uow.clients.rows.get(onlySource.id)?.tagIds).toEqual([target]);
    expect(uow.clients.rows.get(both.id)?.tagIds).toEqual([target]);
    expect(uow.tags.rows.has(source)).toBe(false);
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'client_tag.merged',
      entityId: target,
      changes: {
        mergedTagId: { before: source, after: null },
        mergedTagName: { before: 'Zona prop', after: null },
        clients: { before: null, after: 2 },
      },
    });
    expect(
      unwrapErr(await mergeTags.execute({ sourceTagId: target, targetTagId: target }, EDITOR)).type,
    ).toBe('InvalidInput');
    expect(
      unwrapErr(await mergeTags.execute({ sourceTagId: MISSING, targetTagId: target }, EDITOR)),
    ).toEqual({ type: 'TagNotFound' });
  });

  it('requires "Editar etiquetas" for every catalog change', async () => {
    const { createGroup, renameGroup, deleteGroup, createTag, updateTag, deleteTag, mergeTags } =
      setup();
    const forbidden = { type: 'Forbidden' };

    expect(unwrapErr(await createGroup.execute({ name: 'X' }, TEST_AGENT))).toEqual(forbidden);
    expect(
      unwrapErr(await renameGroup.execute({ groupId: MISSING, name: 'X' }, TEST_AGENT)),
    ).toEqual(forbidden);
    expect(unwrapErr(await deleteGroup.execute({ groupId: MISSING }, TEST_AGENT))).toEqual(
      forbidden,
    );
    expect(unwrapErr(await createTag.execute({ name: 'X' }, TEST_AGENT))).toEqual(forbidden);
    expect(unwrapErr(await updateTag.execute({ tagId: MISSING, name: 'X' }, TEST_AGENT))).toEqual(
      forbidden,
    );
    expect(unwrapErr(await deleteTag.execute({ tagId: MISSING }, TEST_AGENT))).toEqual(forbidden);
    expect(
      unwrapErr(
        await mergeTags.execute({ sourceTagId: MISSING, targetTagId: AGENT_ID }, TEST_AGENT),
      ),
    ).toEqual(forbidden);
  });

  it('reports missing groups and tags', async () => {
    const { renameGroup, deleteGroup, updateTag, deleteTag } = setup();

    expect(unwrapErr(await renameGroup.execute({ groupId: MISSING, name: 'X' }, EDITOR))).toEqual({
      type: 'TagGroupNotFound',
    });
    expect(unwrapErr(await deleteGroup.execute({ groupId: MISSING }, EDITOR))).toEqual({
      type: 'TagGroupNotFound',
    });
    expect(unwrapErr(await updateTag.execute({ tagId: MISSING, name: 'X' }, EDITOR))).toEqual({
      type: 'TagNotFound',
    });
    expect(unwrapErr(await deleteTag.execute({ tagId: MISSING }, EDITOR))).toEqual({
      type: 'TagNotFound',
    });
  });
});

describe('ChangeClientTags', () => {
  it('replaces the tags of a contact and audits the change against the contact', async () => {
    const { uow, createTag, changeTags } = setup();
    const a = unwrap(await createTag.execute({ name: 'Inversor VIP' }, EDITOR)).tagId;
    const b = unwrap(await createTag.execute({ name: 'Colega' }, EDITOR)).tagId;
    const client = await seedClient(uow);

    unwrap(await changeTags.execute({ clientId: client.id, tagIds: [b, a] }, TEST_AGENT));
    unwrap(await changeTags.execute({ clientId: client.id, tagIds: [a, b] }, TEST_AGENT));
    unwrap(await changeTags.execute({ clientId: client.id, tagIds: [a] }, TEST_AGENT));

    expect(uow.clients.rows.get(client.id)?.tagIds).toEqual([a]);
    const entries = uow.audit.entries.filter((e) => e.action === 'client.tags_changed');
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      entityType: 'client',
      entityId: client.id,
      clientIds: [client.id],
      changes: { tagIds: { before: [a, b].sort(), after: [a] } },
    });
  });

  it('rejects unknown tags, contacts of others, the trash and actors without permission', async () => {
    const { uow, createTag, changeTags } = setup();
    const tagId = unwrap(await createTag.execute({ name: 'Colega' }, EDITOR)).tagId;
    const mine = await seedClient(uow);
    const others = await seedClient(uow, {
      phones: ['+541147770002'],
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    const trashed = await seedClient(uow, { phones: ['+541147770003'], deleted: true });

    expect(
      unwrapErr(await changeTags.execute({ clientId: mine.id, tagIds: [MISSING] }, TEST_AGENT)),
    ).toEqual({ type: 'TagNotFound' });
    expect(
      unwrapErr(await changeTags.execute({ clientId: others.id, tagIds: [tagId] }, TEST_AGENT)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      (await changeTags.execute({ clientId: others.id, tagIds: [tagId] }, TEST_MANAGER)).isOk(),
    ).toBe(true);
    expect(
      unwrapErr(await changeTags.execute({ clientId: trashed.id, tagIds: [tagId] }, TEST_AGENT)),
    ).toEqual({ type: 'ClientInTrash' });
    expect(
      unwrapErr(await changeTags.execute({ clientId: mine.id, tagIds: [] }, TEST_OUTSIDER)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await changeTags.execute({ clientId: MISSING, tagIds: [] }, TEST_AGENT)),
    ).toEqual({ type: 'ClientNotFound' });
  });
});

describe('tag queries', () => {
  const group = { id: 'g1', name: 'Origen', position: 0, tagCount: 2, clientCount: 7 };
  const tag = { id: 't1', name: 'Zonaprop', groupId: 'g1', groupName: 'Origen', clients: 5 };

  it('lists groups and searches tags paginated, for whoever sees contacts', async () => {
    const query = new StubClientTagQuery([group], [tag]);

    const groups = unwrap(
      await new ListClientTagGroups({ tags: query }).execute({ sort: 'name' }, TEST_AGENT),
    );
    const tags = unwrap(
      await new SearchClientTags({ tags: query }).execute(
        { q: 'zona', group: 'none', sort: '-name', page: 2, pageSize: 10 },
        TEST_AGENT,
      ),
    );

    expect(groups.items).toEqual([group]);
    expect(query.groupCriteria[0]).toMatchObject({ sort: { field: 'name', direction: 'asc' } });
    expect(tags.items).toEqual([tag]);
    expect(query.tagCriteria[0]).toEqual({
      text: 'zona',
      groupId: null,
      direction: 'desc',
      offset: 10,
      limit: 10,
    });
  });

  it('rejects actors without clients:read and invalid queries', async () => {
    const query = new StubClientTagQuery();
    expect(
      unwrapErr(await new ListClientTagGroups({ tags: query }).execute({}, TEST_OUTSIDER)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await new SearchClientTags({ tags: query }).execute({ group: 'x' }, TEST_AGENT))
        .type,
    ).toBe('InvalidInput');
  });
});
