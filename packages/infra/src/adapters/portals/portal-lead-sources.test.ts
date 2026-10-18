import { FakePortalLeadSource } from '@norde/core/portals/testing';
import { unwrap } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import { PortalLeadSourcesByProvider } from './portal-lead-sources';

describe('PortalLeadSourcesByProvider', () => {
  it('reads the leads of each portal from the source of its provider', async () => {
    const mercadolibre = new FakePortalLeadSource();
    const zonaprop = new FakePortalLeadSource();
    const source = new PortalLeadSourcesByProvider({ mercadolibre, zonaprop });
    const page = { externalAccountId: '1', since: new Date(0), offset: 0, limit: 10 };

    unwrap(await source.recent({ ...page, portal: 'mercadolibre_developments' }));
    unwrap(await source.recent({ ...page, portal: 'zonaprop' }));

    expect(mercadolibre.calls).toHaveLength(1);
    expect(zonaprop.calls).toHaveLength(1);
  });
});
