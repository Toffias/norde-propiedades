import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import {
  BRANCH_ID,
  DEVELOPMENT_ID,
  developmentSnapshot,
  InMemoryPropertiesUnitOfWork,
  InMemoryProducers,
  OTHER_USER_ID,
  TEST_DEVELOPER,
  TEST_DEVELOPMENTS_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { UpdateDevelopmentChances } from './update-development-chances';

const AGENT_A = '00000000-0000-7000-8000-0000000000c1';
const AGENT_B = '00000000-0000-7000-8000-0000000000c2';
const INACTIVE = '00000000-0000-7000-8000-0000000000c3';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';

function setup(overrides: Parameters<typeof developmentSnapshot>[0] = {}) {
  const uow = new InMemoryPropertiesUnitOfWork();
  const snapshot = developmentSnapshot(overrides);
  uow.developments.rows.set(snapshot.id, snapshot);
  const agents = new InMemoryProducers(
    new Map([
      [AGENT_A, { branchId: BRANCH_ID }],
      [AGENT_B, { branchId: undefined }],
    ]),
  );
  const chances = new UpdateDevelopmentChances({ uow, agents, clock: new FixedClock(TEST_NOW) });
  const stored = () => {
    const row = uow.developments.rows.get(DEVELOPMENT_ID);
    if (!row) throw new Error('The development was not stored');
    return row;
  };
  return { uow, chances, stored };
}

const BOTH = [
  { userId: AGENT_A, weight: 2 },
  { userId: AGENT_B, weight: 1 },
];

describe('UpdateDevelopmentChances', () => {
  it('saves the agents in order and records the change in the history', async () => {
    const { uow, chances, stored } = setup();
    unwrap(await chances.execute({ developmentId: DEVELOPMENT_ID, agents: BOTH }, TEST_DEVELOPER));

    expect(stored()).toMatchObject({ chances: BOTH, inquiryRouteCursor: 0n, updatedAt: TEST_NOW });
    expect(uow.developments.savedBy.get(DEVELOPMENT_ID)).toBe(TEST_DEVELOPER.id);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'development.chances_updated',
        entityType: 'development',
        entityId: DEVELOPMENT_ID,
        actorId: TEST_DEVELOPER.id,
        changes: { chances: { before: [], after: BOTH } },
      }),
    ]);
  });

  it('records nothing when the chances are the same', async () => {
    const { uow, chances } = setup({ chances: BOTH, inquiryRouteCursor: 4n });
    unwrap(await chances.execute({ developmentId: DEVELOPMENT_ID, agents: BOTH }, TEST_DEVELOPER));
    expect(uow.audit.entries).toEqual([]);
    expect(uow.developments.savedBy.size).toBe(0);
  });

  it('turns off the derivation with no agents', async () => {
    const { uow, chances, stored } = setup({ chances: BOTH });
    unwrap(await chances.execute({ developmentId: DEVELOPMENT_ID, agents: [] }, TEST_DEVELOPER));
    expect(stored().chances).toEqual([]);
    expect(uow.audit.entries[0]?.changes).toEqual({ chances: { before: BOTH, after: [] } });
  });

  it('rejects an inactive agent that is added, but keeps one that was already there', async () => {
    const { chances, stored } = setup({ chances: [{ userId: INACTIVE, weight: 1 }] });
    expect(
      unwrapErr(
        await chances.execute(
          {
            developmentId: DEVELOPMENT_ID,
            agents: [
              { userId: INACTIVE, weight: 1 },
              { userId: OTHER_USER_ID, weight: 1 },
            ],
          },
          TEST_DEVELOPER,
        ),
      ),
    ).toEqual({ type: 'ChanceAgentNotFound', userId: OTHER_USER_ID });

    unwrap(
      await chances.execute(
        {
          developmentId: DEVELOPMENT_ID,
          agents: [
            { userId: INACTIVE, weight: 3 },
            { userId: AGENT_A, weight: 1 },
          ],
        },
        TEST_DEVELOPER,
      ),
    );
    expect(stored().chances).toEqual([
      { userId: INACTIVE, weight: 3 },
      { userId: AGENT_A, weight: 1 },
    ]);
  });

  it('rejects repeated agents, weights out of range and an unknown development', async () => {
    const { chances } = setup();
    expect(
      unwrapErr(
        await chances.execute(
          {
            developmentId: DEVELOPMENT_ID,
            agents: [
              { userId: AGENT_A, weight: 1 },
              { userId: AGENT_A, weight: 2 },
            ],
          },
          TEST_DEVELOPER,
        ),
      ),
    ).toEqual({ type: 'InvalidDevelopmentChances', reason: 'duplicate_agent' });
    expect(
      unwrapErr(
        await chances.execute(
          { developmentId: DEVELOPMENT_ID, agents: [{ userId: AGENT_A, weight: 11 }] },
          TEST_DEVELOPER,
        ),
      ),
    ).toMatchObject({ type: 'InvalidInput' });
    expect(
      unwrapErr(
        await chances.execute(
          { developmentId: '00000000-0000-7000-8000-0000000000ff', agents: BOTH },
          TEST_DEVELOPER,
        ),
      ),
    ).toEqual({ type: 'DevelopmentNotFound' });
  });

  it('does not change the chances of a development in the trash', async () => {
    const { chances } = setup({ deletedAt: TEST_NOW, deletedBy: OTHER_USER_ID });
    expect(
      unwrapErr(
        await chances.execute({ developmentId: DEVELOPMENT_ID, agents: BOTH }, TEST_DEVELOPER),
      ),
    ).toEqual({ type: 'DevelopmentInTrash' });
  });

  it('lets each actor change their own, their branch or all developments', async () => {
    const input = { developmentId: DEVELOPMENT_ID, agents: BOTH };
    const branchEditor = Actor.user('00000000-0000-7000-8000-0000000000a4', [
      'developments:read',
      'developments:update-branch',
    ]).withBranch(BRANCH_ID);

    const others = { producerUserId: OTHER_USER_ID, branchId: OTHER_BRANCH };
    expect(unwrapErr(await setup(others).chances.execute(input, TEST_DEVELOPER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await setup(others).chances.execute(input, branchEditor))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await setup(others).chances.execute(input, TEST_DEVELOPMENTS_MANAGER));
    unwrap(
      await setup({ producerUserId: OTHER_USER_ID, branchId: BRANCH_ID }).chances.execute(
        input,
        branchEditor,
      ),
    );
    expect(unwrapErr(await setup().chances.execute(input, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});
