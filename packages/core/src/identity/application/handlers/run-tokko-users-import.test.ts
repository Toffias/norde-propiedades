import { describe, expect, it } from 'vitest';

import { Actor, Email } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { StartTokkoUsersImport } from '../commands/start-tokko-users-import';
import {
  branchSnapshot,
  FakeTokkoUserSource,
  InMemoryIdentityUnitOfWork,
  MAIN_BRANCH_ID,
  ROLE_AGENT_ID,
  roleSnapshot,
  seedBranch,
  seedRole,
  seedUser,
  TEST_ADMIN,
  TEST_AGENT,
  TEST_NOW,
  testUserId,
  userSnapshot,
} from '../../testing';

import { RunTokkoUsersImport } from './run-tokko-users-import';

// Usuarios con la forma de `/api/v1/user/` de Tokko y agentes de sus contactos, inventados.

const JOB_ACTOR = Actor.system('import', ['users:create']);

const MARIELA = {
  tokkoId: '1961',
  name: 'Mariela Prueba',
  email: 'mariela@example.test',
  phone: '11 4401 7116',
};
const FACUNDO = {
  tokkoId: '1891',
  name: 'Facundo Prueba',
  email: 'facundo@example.test',
  phone: undefined,
};
const FORMER = {
  tokkoId: '3232',
  name: 'Ex Agente Prueba',
  email: 'ex@example.test',
  phone: undefined,
};
const FORMER_NO_EMAIL = {
  tokkoId: '31001',
  name: 'Otro Ex Agente',
  email: undefined,
  phone: undefined,
};
const LIBRE = { tokkoId: '777', name: 'Libre', email: 'bolsa@example.test', phone: undefined };

function setup(
  source = new FakeTokkoUserSource([MARIELA, FACUNDO], [MARIELA, FORMER, FORMER_NO_EMAIL, LIBRE]),
) {
  const uow = new InMemoryIdentityUnitOfWork();
  seedRole(uow, roleSnapshot({ id: ROLE_AGENT_ID, key: 'agent', name: 'Agente' }));
  seedBranch(uow, branchSnapshot());
  const deps = { uow, ids: new SequentialIdGenerator(), clock: new FixedClock(TEST_NOW) };
  return {
    uow,
    source,
    start: new StartTokkoUsersImport({ ...deps, configured: true }),
    run: new RunTokkoUsersImport({ ...deps, source }),
  };
}

const byName = (uow: InMemoryIdentityUnitOfWork, name: string) =>
  [...uow.users.rows.values()].find((u) => u.name === name);

describe('Tokko users import', () => {
  it('copies the current Tokko users active, as agents of the main branch, without password', async () => {
    const { uow, run } = setup();

    unwrap(await run.execute({}, JOB_ACTOR));

    expect(byName(uow, 'Mariela Prueba')).toMatchObject({
      status: 'active',
      email: unwrap(Email.create('mariela@example.test')),
      phone: { e164: '+541144017116' },
      branchId: MAIN_BRANCH_ID,
      roleIds: [ROLE_AGENT_ID],
      mustChangePassword: true,
    });
    // Entran cuando un administrador les blanquea una contraseña.
    expect(uow.credentials.hashes.size).toBe(0);
    expect(uow.audit.entries.find((e) => e.action === 'user.imported')).toMatchObject({
      actorId: 'system:import',
    });
  });

  it('copies the former Tokko users suspended, with a never-delivered email if they had none', async () => {
    const { uow, run, source } = setup();

    expect(unwrap(await run.execute({}, JOB_ACTOR))).toEqual({
      created: 2,
      suspended: 2,
      existing: 0,
      skipped: 0,
      unassigned: 1,
    });
    // "Libre" es la bolsa de contactos sin agente de Tokko: no se copia.
    expect(byName(uow, 'Libre')).toBeUndefined();
    expect(source.knownAsked).toEqual([['1961', '1891']]);
    expect(byName(uow, 'Ex Agente Prueba')).toMatchObject({ status: 'suspended' });
    expect(byName(uow, 'Otro Ex Agente')).toMatchObject({
      status: 'suspended',
      email: unwrap(Email.create('tokko-31001@usuarios-tokko.invalid')),
    });
    expect(
      uow.audit.entries.filter((e) => e.action === 'user.suspended').map((e) => e.entityId),
    ).toEqual([byName(uow, 'Ex Agente Prueba')?.id, byName(uow, 'Otro Ex Agente')?.id]);
  });

  it('keeps the users already in Norde, by email or by name, and runs again without duplicating', async () => {
    const { uow, run } = setup();
    seedUser(
      uow,
      userSnapshot({
        id: testUserId('00000000-0000-7000-8000-0000000000e1'),
        name: 'MARIELA PRUEBA',
        email: unwrap(Email.create('m@norde.com.ar')),
      }),
    );
    seedUser(
      uow,
      userSnapshot({
        id: testUserId('00000000-0000-7000-8000-0000000000e2'),
        name: 'Facu',
        email: unwrap(Email.create('facundo@example.test')),
      }),
    );

    expect(unwrap(await run.execute({}, JOB_ACTOR))).toMatchObject({ created: 0, existing: 2 });
    expect(unwrap(await run.execute({}, JOB_ACTOR))).toEqual({
      created: 0,
      suspended: 0,
      existing: 4,
      skipped: 0,
      unassigned: 1,
    });
  });

  it('skips a current user without a valid email', async () => {
    const { run } = setup(new FakeTokkoUserSource([{ ...MARIELA, email: 'no es un email' }], []));

    expect(unwrap(await run.execute({}, JOB_ACTOR))).toMatchObject({ created: 0, skipped: 1 });
  });

  it('needs the agent role, the main branch and Tokko answering', async () => {
    const noRole = setup();
    noRole.uow.roles.rows.clear();
    expect(unwrapErr(await noRole.run.execute({}, JOB_ACTOR))).toEqual({
      type: 'TokkoUsersSetupMissing',
      missing: 'agent_role',
    });

    const down = setup();
    down.source.unavailable = true;
    expect(unwrapErr(await down.run.execute({}, JOB_ACTOR))).toEqual({ type: 'TokkoUnavailable' });
    expect(unwrapErr(await down.run.execute({}, TEST_AGENT))).toEqual({ type: 'Forbidden' });
  });
});

describe('Tokko users import run tracking', () => {
  async function requested() {
    const context = setup();
    unwrap(await context.start.execute({}, TEST_ADMIN));
    const [job] = [...context.uow.tokkoUsersImports.rows.values()];
    if (!job) throw new Error('No import was saved');
    return { ...context, importId: job.id };
  }

  it('finishes the saved run with the summary, audited, and does not run it twice', async () => {
    const { uow, run, source, importId } = await requested();

    const summary = unwrap(await run.execute({ importId }, JOB_ACTOR));

    expect(uow.tokkoUsersImports.rows.get(importId)).toMatchObject({
      status: 'done',
      summary,
      requestedBy: TEST_ADMIN.id,
      startedAt: TEST_NOW,
      finishedAt: TEST_NOW,
    });
    expect(uow.audit.entries.find((e) => e.action === 'user.tokko_import_finished')).toMatchObject({
      entityId: importId,
      changes: { status: { before: 'running', after: 'done' } },
    });
    // Una entrega repetida del evento no vuelve a pedirle los usuarios a Tokko.
    expect(unwrap(await run.execute({ importId }, JOB_ACTOR))).toEqual(summary);
    expect(source.knownAsked).toHaveLength(1);
  });

  it('marks the saved run failed when Tokko does not answer or the setup is missing', async () => {
    const down = await requested();
    down.source.unavailable = true;
    unwrapErr(await down.run.execute({ importId: down.importId }, JOB_ACTOR));
    expect(down.uow.tokkoUsersImports.rows.get(down.importId)).toMatchObject({
      status: 'failed',
      failure: 'tokko_unavailable',
    });

    const noBranch = await requested();
    noBranch.uow.branches.rows.clear();
    unwrapErr(await noBranch.run.execute({ importId: noBranch.importId }, JOB_ACTOR));
    expect(noBranch.uow.tokkoUsersImports.rows.get(noBranch.importId)).toMatchObject({
      status: 'failed',
      failure: 'main_branch_missing',
    });
  });

  it('runs an event from before the runs were saved, without one', async () => {
    const { uow, run } = setup();

    unwrap(await run.execute({ importId: '00000000-0000-7000-8000-00000000ffff' }, JOB_ACTOR));

    expect(byName(uow, 'Mariela Prueba')).toBeDefined();
    expect(uow.tokkoUsersImports.rows.size).toBe(0);
  });
});

describe('StartTokkoUsersImport', () => {
  it('asks the job to bring the users, audited, for who can create users', async () => {
    const { uow, start } = setup();

    unwrap(await start.execute({}, TEST_ADMIN));

    expect(uow.events.published.map((e) => e.type)).toEqual([
      'identity.tokko_users_import_requested',
    ]);
    expect(uow.audit.entries.map((e) => e.action)).toEqual(['user.tokko_import_requested']);
    // La corrida queda guardada, pendiente y a nombre de quien la pidió.
    const [job] = [...uow.tokkoUsersImports.rows.values()];
    expect(job).toMatchObject({ status: 'pending', requestedBy: TEST_ADMIN.id });
    expect(uow.events.published[0]?.payload).toEqual({ requestId: job?.id });
    expect(unwrapErr(await start.execute({}, TEST_AGENT))).toEqual({ type: 'Forbidden' });
    const unconfigured = new StartTokkoUsersImport({
      uow,
      configured: false,
      ids: new SequentialIdGenerator(),
      clock: new FixedClock(TEST_NOW),
    });
    expect(unwrapErr(await unconfigured.execute({}, TEST_ADMIN))).toEqual({
      type: 'TokkoApiNotConfigured',
    });
  });
});
