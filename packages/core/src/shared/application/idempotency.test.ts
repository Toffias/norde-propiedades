import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { err, ok, type Result } from '../domain/result';
import { InMemoryIdempotencyKeys } from '../testing';

import { idempotencyScope, runIdempotent } from './idempotency';

const ResultSchema = z.object({ id: z.string() });
const KEY = '0190a5b8-0000-7000-8000-000000000001';

function counter() {
  let runs = 0;
  return {
    get runs() {
      return runs;
    },
    work: (outcome: Result<{ id: string }, string> = ok({ id: `created-${String(runs + 1)}` })) => {
      return () => {
        runs += 1;
        return Promise.resolve(outcome);
      };
    },
  };
}

describe('runIdempotent', () => {
  it('runs every time when the request brings no key', async () => {
    const keys = new InMemoryIdempotencyKeys();
    const calls = counter();

    await runIdempotent(keys, undefined, ResultSchema, calls.work());
    await runIdempotent(keys, undefined, ResultSchema, calls.work());

    expect(calls.runs).toBe(2);
    expect(keys.rows.size).toBe(0);
  });

  it('runs once per key and replays the stored result', async () => {
    const keys = new InMemoryIdempotencyKeys();
    const calls = counter();
    const scope = idempotencyScope('user-1', 'CreateClient', KEY);

    const first = await runIdempotent(keys, scope, ResultSchema, calls.work());
    const second = await runIdempotent(keys, scope, ResultSchema, calls.work());

    expect(calls.runs).toBe(1);
    expect(first).toEqual(ok({ id: 'created-1' }));
    expect(second).toEqual(ok({ id: 'created-1' }));
  });

  it('scopes the key by actor and command', async () => {
    const keys = new InMemoryIdempotencyKeys();
    const calls = counter();

    await runIdempotent(
      keys,
      idempotencyScope('user-1', 'CreateClient', KEY),
      ResultSchema,
      calls.work(),
    );
    await runIdempotent(
      keys,
      idempotencyScope('user-2', 'CreateClient', KEY),
      ResultSchema,
      calls.work(),
    );
    await runIdempotent(
      keys,
      idempotencyScope('user-1', 'AddClientNote', KEY),
      ResultSchema,
      calls.work(),
    );

    expect(calls.runs).toBe(3);
  });

  it('does not store a failed run', async () => {
    const keys = new InMemoryIdempotencyKeys();
    const calls = counter();
    const scope = idempotencyScope('user-1', 'CreateClient', KEY);

    const failed = await runIdempotent(keys, scope, ResultSchema, calls.work(err('Invalid')));

    expect(failed).toEqual(err('Invalid'));
    // La clave quedó reservada sin resultado: en la base, el rollback la libera.
    expect(keys.rows.get(`user-1:CreateClient:${KEY}`)).toBeNull();
  });

  it('throws when the stored result does not match the schema', async () => {
    const keys = new InMemoryIdempotencyKeys();
    const scope = idempotencyScope('user-1', 'CreateClient', KEY);
    if (scope === undefined) throw new Error('scope expected');
    await keys.claim(scope);
    await keys.complete(scope, { other: 1 });

    await expect(
      runIdempotent(keys, scope, ResultSchema, () => Promise.resolve(ok({ id: 'x' }))),
    ).rejects.toThrow();
  });
});
