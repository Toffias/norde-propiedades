import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { SequentialIdGenerator, unwrap, unwrapErr } from '../../shared/testing';
import { InMemoryDirectory, InMemorySettingsUnitOfWork } from '../testing';

import { AllocateReferenceCode } from './commands/allocate-reference-code';
import { ChangeReferenceCodePrefix } from './commands/change-reference-code-prefix';
import { CreateReferenceCodeSequence } from './commands/create-reference-code-sequence';
import { DeleteReferenceCodeSequence } from './commands/delete-reference-code-sequence';
import { ListReferenceCodeSequences } from './queries/list-reference-code-sequences';
import { SearchDirectory } from './queries/search-directory';

const admin = Actor.user('00000000-0000-7000-8000-0000000000ad', ['settings:*']);
const agent = Actor.user('00000000-0000-7000-8000-0000000000a6', [
  'properties:create',
  'settings:read',
]);
const USER = '00000000-0000-7000-8000-00000000aaaa';
const TEAM = '00000000-0000-7000-8000-00000000bbbb';

function setup() {
  const uow = new InMemorySettingsUnitOfWork();
  const directory = new InMemoryDirectory();
  return {
    uow,
    directory,
    create: new CreateReferenceCodeSequence({ uow, ids: new SequentialIdGenerator() }),
    changePrefix: new ChangeReferenceCodePrefix({ uow }),
    remove: new DeleteReferenceCodeSequence({ uow }),
    allocate: new AllocateReferenceCode({ uow }),
    list: new ListReferenceCodeSequences({ sequences: uow.sequences, directory }),
    search: new SearchDirectory({ directory }),
  };
}

async function withGlobal(ctx: ReturnType<typeof setup>) {
  return unwrap(await ctx.create.execute({ scope: 'global', prefix: 'P' }, admin)).sequenceId;
}

describe('CreateReferenceCodeSequence', () => {
  it('creates a sequence and audits it', async () => {
    const ctx = setup();

    const { sequenceId } = unwrap(
      await ctx.create.execute(
        { scope: 'property_type', scopeValue: 'house', prefix: 'cas' },
        admin,
      ),
    );

    expect(ctx.uow.sequences.rows.get(sequenceId)).toMatchObject({
      scope: 'property_type',
      scopeValue: 'house',
      nextNumber: 1n,
    });
    expect(ctx.uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'reference_code_sequence.created',
        entityType: 'reference_code_sequence',
        entityId: sequenceId,
        changes: {
          scope: { before: null, after: 'property_type' },
          scopeValue: { before: null, after: 'house' },
          prefix: { before: null, after: 'CAS' },
        },
      }),
    ]);
  });

  it('rejects a repeated prefix or scope', async () => {
    const ctx = setup();
    await withGlobal(ctx);

    expect(
      unwrapErr(await ctx.create.execute({ scope: 'user', scopeValue: USER, prefix: 'p' }, admin)),
    ).toEqual({ type: 'PrefixInUse', prefix: 'P' });
    expect(unwrapErr(await ctx.create.execute({ scope: 'global', prefix: 'X' }, admin))).toEqual({
      type: 'ScopeAlreadyConfigured',
    });
    expect(ctx.uow.audit.entries).toHaveLength(1);
  });

  it('validates the scope value', async () => {
    const ctx = setup();
    const invalid = [
      { scope: 'user', scopeValue: 'camila', prefix: 'CM' },
      { scope: 'property_type', scopeValue: 'castillo', prefix: 'CA' },
      { scope: 'global', scopeValue: 'x', prefix: 'G' },
    ] as const;
    for (const input of invalid) {
      expect(unwrapErr(await ctx.create.execute(input, admin))).toMatchObject({
        type: 'ValidationFailed',
      });
    }
  });

  it('is only for administrators', async () => {
    const ctx = setup();
    expect(unwrapErr(await ctx.create.execute({ scope: 'global', prefix: 'P' }, agent))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('ChangeReferenceCodePrefix and DeleteReferenceCodeSequence', () => {
  it('changes the prefix and audits the diff', async () => {
    const ctx = setup();
    const sequenceId = await withGlobal(ctx);

    unwrap(await ctx.changePrefix.execute({ sequenceId, prefix: 'N' }, admin));

    expect(ctx.uow.sequences.rows.get(sequenceId)?.prefix.value).toBe('N');
    expect(ctx.uow.audit.entries[1]).toMatchObject({
      kind: 'updated',
      action: 'reference_code_sequence.updated',
      changes: { prefix: { before: 'P', after: 'N' } },
    });
  });

  it('rejects a prefix used by another sequence and an unknown sequence', async () => {
    const ctx = setup();
    const globalId = await withGlobal(ctx);
    unwrap(await ctx.create.execute({ scope: 'user', scopeValue: USER, prefix: 'EZ' }, admin));

    expect(
      unwrapErr(await ctx.changePrefix.execute({ sequenceId: globalId, prefix: 'EZ' }, admin)),
    ).toEqual({ type: 'PrefixInUse', prefix: 'EZ' });
    expect(
      unwrapErr(
        await ctx.changePrefix.execute(
          { sequenceId: '00000000-0000-7000-8000-000000000999', prefix: 'X' },
          admin,
        ),
      ),
    ).toEqual({ type: 'NotFound' });
  });

  it('deletes an exclusive sequence but never the global one', async () => {
    const ctx = setup();
    const globalId = await withGlobal(ctx);
    const { sequenceId } = unwrap(
      await ctx.create.execute({ scope: 'team', scopeValue: TEAM, prefix: 'EQ' }, admin),
    );

    expect(unwrapErr(await ctx.remove.execute({ sequenceId: globalId }, admin))).toEqual({
      type: 'GlobalSequenceRequired',
    });
    unwrap(await ctx.remove.execute({ sequenceId }, admin));

    expect(ctx.uow.sequences.rows.has(sequenceId)).toBe(false);
    expect(ctx.uow.audit.entries.at(-1)).toMatchObject({
      kind: 'action',
      action: 'reference_code_sequence.deleted',
      changes: { prefix: { before: 'EQ', after: null } },
    });
  });

  it('is only for administrators', async () => {
    const ctx = setup();
    const sequenceId = await withGlobal(ctx);
    expect(unwrapErr(await ctx.changePrefix.execute({ sequenceId, prefix: 'X' }, agent))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await ctx.remove.execute({ sequenceId }, agent))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('AllocateReferenceCode', () => {
  it('uses the most specific sequence and numbers each prefix on its own', async () => {
    const ctx = setup();
    await withGlobal(ctx);
    unwrap(
      await ctx.create.execute(
        { scope: 'property_type', scopeValue: 'house', prefix: 'CAS' },
        admin,
      ),
    );
    unwrap(await ctx.create.execute({ scope: 'user', scopeValue: USER, prefix: 'EZ' }, admin));

    const codes = [];
    for (const input of [
      { target: 'property', propertyType: 'house' },
      { target: 'property', propertyType: 'house' },
      { target: 'property', propertyType: 'land' },
      { target: 'property', propertyType: 'house', userId: USER },
    ] as const) {
      codes.push(unwrap(await ctx.allocate.execute(input, agent)).code);
    }

    expect(codes).toEqual(['CAS0001', 'CAS0002', 'P0001', 'EZ0001']);
  });

  it('skips codes already taken by hand', async () => {
    const ctx = setup();
    await withGlobal(ctx);
    ctx.uow.codeUsage.taken.add('P0001');
    ctx.uow.codeUsage.taken.add('P0002');

    expect(unwrap(await ctx.allocate.execute({ target: 'property' }, agent)).code).toBe('P0003');
  });

  it('fails without a global sequence', async () => {
    const ctx = setup();
    expect(unwrapErr(await ctx.allocate.execute({ target: 'property' }, agent))).toEqual({
      type: 'NoReferenceCodeSequence',
    });
  });

  it('requires the permission to create what is being numbered', async () => {
    const ctx = setup();
    await withGlobal(ctx);
    expect(unwrapErr(await ctx.allocate.execute({ target: 'development' }, agent))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('ListReferenceCodeSequences and SearchDirectory', () => {
  it('lists the sequences with the next code and who they apply to', async () => {
    const ctx = setup();
    ctx.directory.entries.user.push({ id: USER, name: 'Camila Pérez' });
    await withGlobal(ctx);
    unwrap(await ctx.create.execute({ scope: 'user', scopeValue: USER, prefix: 'CP' }, admin));
    unwrap(await ctx.allocate.execute({ target: 'property' }, agent));

    const page = unwrap(await ctx.list.execute({ page: 1, pageSize: 10 }, admin));

    expect(page.total).toBe(2);
    expect(page.items).toEqual([
      expect.objectContaining({ scope: 'global', scopeName: undefined, nextCode: 'P0002' }),
      expect.objectContaining({ scope: 'user', scopeName: 'Camila Pérez', nextCode: 'CP0001' }),
    ]);
  });

  it('searches the directory by name', async () => {
    const ctx = setup();
    ctx.directory.entries.team.push({ id: TEAM, name: 'Ventas zona norte' });

    const page = unwrap(await ctx.search.execute({ kind: 'team', search: 'norte' }, admin));

    expect(page.items).toEqual([{ id: TEAM, name: 'Ventas zona norte' }]);
  });

  it('requires reading the settings', async () => {
    const ctx = setup();
    const outsider = Actor.user(USER, []);
    expect(unwrapErr(await ctx.list.execute({}, outsider))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await ctx.search.execute({ kind: 'user' }, outsider))).toEqual({
      type: 'Forbidden',
    });
  });
});
