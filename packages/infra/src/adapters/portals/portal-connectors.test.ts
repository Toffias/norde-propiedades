import { FakePortalConnector, listingSource } from '@norde/core/portals/testing';
import { unwrap } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import { PortalConnectorsByProvider } from './portal-connectors';

const CONTENT = {
  listingId: '01920000-0000-7000-8000-00000000a001',
  source: listingSource(),
  operation: undefined,
  listingType: 'simple',
  plan: 'SIMPLE',
} as const;

describe('PortalConnectorsByProvider', () => {
  it('sends each portal to the connector of its provider', async () => {
    const mercadolibre = new FakePortalConnector();
    const zonaprop = new FakePortalConnector();
    zonaprop.problemsFound = ['Falta algo para Zonaprop.'];
    const connector = new PortalConnectorsByProvider({ mercadolibre, zonaprop });

    unwrap(await connector.create('zonaprop', CONTENT));
    unwrap(await connector.create('mercadolibre_developments', CONTENT));
    unwrap(await connector.close('mercadolibre', 'MLA1'));

    expect(zonaprop.calls.map((c) => c.method)).toEqual(['create']);
    expect(mercadolibre.calls.map((c) => c.method)).toEqual(['create', 'close']);
    expect(connector.problems('zonaprop', CONTENT)).toEqual(['Falta algo para Zonaprop.']);
    expect(connector.problems('mercadolibre', CONTENT)).toEqual([]);
  });
});
