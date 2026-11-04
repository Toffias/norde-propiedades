import {
  FindPropertiesByCodeInputSchema,
  MAX_PROPERTY_CODES,
  type PanelPropertyRow,
} from '@norde/core/properties/contracts';
import { Actor, err, ok, type Result } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { propertyCodeLookup } from './property-code-lookup';

const ACTOR = Actor.system('portal-sync', ['properties:read']);

function row(code: string): PanelPropertyRow {
  return {
    id: `id-${code}`,
    code,
    portalTitle: `Propiedad ${code}`,
    developmentId: undefined,
  } as unknown as PanelPropertyRow; // Fila recortada: el adaptador usa solo estos campos.
}

/** Como FindPropertiesByCode: rechaza más códigos de los que acepta su contract. */
function fakeFindByCode() {
  const calls: (readonly string[])[] = [];
  return {
    calls,
    execute(input: {
      readonly codes: readonly string[];
    }): Promise<Result<readonly PanelPropertyRow[], { readonly type: string }>> {
      calls.push(input.codes);
      if (!FindPropertiesByCodeInputSchema.safeParse(input).success) {
        return Promise.resolve(err({ type: 'InvalidSearch' }));
      }
      return Promise.resolve(ok(input.codes.map(row)));
    },
  };
}

describe('propertyCodeLookup', () => {
  it('searches in batches when a page brings more codes than the search accepts (#202)', async () => {
    const findByCode = fakeFindByCode();
    const lookup = propertyCodeLookup({ findByCode, actor: ACTOR });
    // 50 avisos aportan 100 códigos: clave interna y código de cada uno.
    const codes = Array.from({ length: 2 * MAX_PROPERTY_CODES }, (_, i) => `C${i}`);

    const found = await lookup.byCodes(codes);

    expect(found).toHaveLength(codes.length);
    expect(findByCode.calls.map((c) => c.length)).toEqual([MAX_PROPERTY_CODES, MAX_PROPERTY_CODES]);
    expect(found[0]).toEqual({
      propertyId: 'id-C0',
      code: 'C0',
      title: 'Propiedad C0',
      developmentId: undefined,
    });
  });

  it('removes duplicated codes before searching', async () => {
    const findByCode = fakeFindByCode();
    const lookup = propertyCodeLookup({ findByCode, actor: ACTOR });

    await lookup.byCodes(['A', 'B', 'A']);

    expect(findByCode.calls).toEqual([['A', 'B']]);
  });

  it('does not search without codes', async () => {
    const findByCode = fakeFindByCode();
    const lookup = propertyCodeLookup({ findByCode, actor: ACTOR });

    expect(await lookup.byCodes([])).toEqual([]);
    expect(findByCode.calls).toEqual([]);
  });

  it('throws when the search fails', async () => {
    const lookup = propertyCodeLookup({
      findByCode: { execute: () => Promise.resolve(err({ type: 'Forbidden' })) },
      actor: ACTOR,
    });

    await expect(lookup.byCodes(['A'])).rejects.toThrow(
      'Property lookup by code failed: Forbidden',
    );
  });
});
