import type { DevelopmentByCodeRow } from '@norde/core/properties';
import {
  FindDevelopmentsByCodeInputSchema,
  MAX_DEVELOPMENT_CODES,
} from '@norde/core/properties/contracts';
import { Actor, err, ok, type Result } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { developmentCodeLookup } from './development-code-lookup';

const ACTOR = Actor.system('portal-sync', ['developments:read']);

/** Como FindDevelopmentsByCode: rechaza más códigos de los que acepta su contract. */
function fakeFindByCode() {
  const calls: (readonly string[])[] = [];
  return {
    calls,
    execute(input: {
      readonly codes: readonly string[];
    }): Promise<Result<readonly DevelopmentByCodeRow[], { readonly type: string }>> {
      calls.push(input.codes);
      if (!FindDevelopmentsByCodeInputSchema.safeParse(input).success) {
        return Promise.resolve(err({ type: 'InvalidSearch' }));
      }
      return Promise.resolve(
        ok(input.codes.map((code) => ({ id: `id-${code}`, code, name: `Torre ${code}` }))),
      );
    },
  };
}

describe('developmentCodeLookup', () => {
  it('searches in batches when there are more codes than the search accepts', async () => {
    const findByCode = fakeFindByCode();
    const lookup = developmentCodeLookup({ findByCode, actor: ACTOR });
    const codes = Array.from({ length: MAX_DEVELOPMENT_CODES + 1 }, (_, i) => `E${i}`);

    const found = await lookup.byCodes(codes);

    expect(found).toHaveLength(codes.length);
    expect(findByCode.calls.map((c) => c.length)).toEqual([MAX_DEVELOPMENT_CODES, 1]);
    expect(found[0]).toEqual({ developmentId: 'id-E0', code: 'E0', name: 'Torre E0' });
  });

  it('removes duplicated codes and skips the search without codes', async () => {
    const findByCode = fakeFindByCode();
    const lookup = developmentCodeLookup({ findByCode, actor: ACTOR });

    expect(await lookup.byCodes([])).toEqual([]);
    await lookup.byCodes(['A', 'B', 'A']);

    expect(findByCode.calls).toEqual([['A', 'B']]);
  });

  it('throws when the search fails', async () => {
    const lookup = developmentCodeLookup({
      findByCode: { execute: () => Promise.resolve(err({ type: 'Forbidden' })) },
      actor: ACTOR,
    });

    await expect(lookup.byCodes(['A'])).rejects.toThrow(
      'Development lookup by code failed: Forbidden',
    );
  });
});
