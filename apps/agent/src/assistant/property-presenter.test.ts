import { SearchProperties, type PropertySummary } from '@norde/core/properties';
import { aPropertyRecord, InMemoryPropertySearchQuery } from '@norde/core/properties/testing';
import { Actor } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { presentSummary } from './property-presenter';

const actor = Actor.system('agent-ia', ['properties:read']);

async function summaryOf(record: ReturnType<typeof aPropertyRecord>): Promise<PropertySummary> {
  const search = new SearchProperties({ properties: new InMemoryPropertySearchQuery([record]) });
  const result = await search.execute({ page: 1, pageSize: 3 }, actor);
  const summary = result.isOk() ? result.value.items[0] : undefined;
  if (!summary) throw new Error('The property was not found');
  return summary;
}

describe('presentSummary', () => {
  it('does not repeat the price nor an equal covered surface', async () => {
    const summary = await summaryOf(
      aPropertyRecord({
        operations: [
          { operation: 'rent', priceCents: 78_000_000n, currency: 'ARS', priceOnRequest: false },
        ],
        surfaceTotalM2: 48,
        surfaceCoveredM2: 48,
      }),
    );

    const presented = presentSummary(summary, 'https://norde.com.ar');

    expect(presented).toMatchObject({ operation: 'Alquiler', price: '$ 780.000' });
    expect(presented).not.toHaveProperty('operations');
    expect(presented).not.toHaveProperty('surfaceCoveredM2');
  });

  it('lists every operation and a different covered surface', async () => {
    const summary = await summaryOf(
      aPropertyRecord({
        operations: [
          { operation: 'sale', priceCents: 12_000_000n, currency: 'USD', priceOnRequest: false },
          { operation: 'rent', priceCents: 78_000_000n, currency: 'ARS', priceOnRequest: false },
        ],
        surfaceTotalM2: 120,
        surfaceCoveredM2: 90,
      }),
    );

    expect(presentSummary(summary, 'https://norde.com.ar')).toMatchObject({
      operations: ['Venta: USD 120.000', 'Alquiler: $ 780.000'],
      surfaceTotalM2: 120,
      surfaceCoveredM2: 90,
    });
  });
});
