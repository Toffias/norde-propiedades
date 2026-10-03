import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { CreateSavedSearchInput } from '../../contracts';
import { MAX_SAVED_SEARCHES_PER_CLIENT } from '../../domain/saved-search';
import {
  InMemoryClientsUnitOfWork,
  InMemorySavedSearchLocations,
  seedClient,
  seedOpportunity,
  seedSavedSearch,
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
} from '../../testing';
import { GetSavedSearch } from '../queries/get-saved-search';

import { CreateSavedSearch } from './create-saved-search';
import { DeleteSavedSearch } from './delete-saved-search';
import { RestoreSavedSearch } from './restore-saved-search';
import { UpdateSavedSearch } from './update-saved-search';

const clock = new FixedClock('2026-03-10T12:00:00Z');
const MISSING = '00000000-0000-7000-8000-0000000000ff';
const PALERMO = '00000000-0000-7000-8000-0000000000a1';
const BELGRANO = '00000000-0000-7000-8000-0000000000a2';

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const client = await seedClient(uow);
  const ids = new SequentialIdGenerator();
  return {
    uow,
    client,
    create: new CreateSavedSearch({ uow, ids, clock }),
    update: new UpdateSavedSearch({ uow, clock }),
    remove: new DeleteSavedSearch({ uow, clock }),
    restore: new RestoreSavedSearch({ uow, clock }),
    get: new GetSavedSearch({
      uow,
      locations: new InMemorySavedSearchLocations(new Map([[PALERMO, 'Palermo']])),
    }),
  };
}

const fields: Omit<CreateSavedSearchInput, 'clientId'> = {
  name: 'Depto en Palermo',
  operation: 'sale',
  propertyTypes: ['apartment'],
  currency: 'USD',
  minPrice: '100000',
  maxPrice: '150000',
  locationIds: [PALERMO],
  minRooms: 2,
};

describe('CreateSavedSearch', () => {
  it('saves the search and audits its initial values against the client', async () => {
    const { uow, client, create } = await setup();

    const { savedSearchId } = unwrap(
      await create.execute({ clientId: client.id, ...fields }, TEST_AGENT),
    );

    expect(uow.savedSearches.rows.get(savedSearchId)).toMatchObject({
      clientId: client.id,
      name: 'Depto en Palermo',
      minPriceCents: 10_000_000n,
      maxPriceCents: 15_000_000n,
      autoSend: false,
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'client.saved_search_created',
        kind: 'created',
        entityId: client.id,
        clientIds: [client.id],
        changes: {
          savedSearchId: { before: null, after: savedSearchId },
          name: { before: null, after: 'Depto en Palermo' },
          operation: { before: null, after: 'sale' },
          propertyTypes: { before: null, after: ['apartment'] },
          currency: { before: null, after: 'USD' },
          minPriceCents: { before: null, after: 10_000_000n },
          maxPriceCents: { before: null, after: 15_000_000n },
          locationIds: { before: null, after: [PALERMO] },
          minRooms: { before: null, after: 2 },
          autoSend: { before: null, after: false },
        },
      }),
    ]);
  });

  it('ties it to an open opportunity of the same client only', async () => {
    const { uow, client, create } = await setup();
    const opportunity = await seedOpportunity(uow, client);
    const other = await seedClient(uow, { phones: ['+541147770099'] });
    const othersOpportunity = await seedOpportunity(uow, other);

    const { savedSearchId } = unwrap(
      await create.execute(
        { clientId: client.id, operation: 'rent', opportunityId: opportunity.id },
        TEST_AGENT,
      ),
    );
    expect(uow.savedSearches.rows.get(savedSearchId)?.opportunityId).toBe(opportunity.id);
    expect(
      unwrapErr(
        await create.execute(
          { clientId: client.id, operation: 'rent', opportunityId: othersOpportunity.id },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'OpportunityNotFound' });
  });

  it('rejects invalid criteria, a missing client and one in the trash', async () => {
    const { uow, client, create } = await setup();
    const trashed = await seedClient(uow, { phones: ['+541147770098'], deleted: true });

    expect(
      unwrapErr(
        await create.execute({ clientId: client.id, operation: 'sale', minRooms: 0 }, TEST_AGENT),
      ).type,
    ).toBe('InvalidInput');
    expect(
      unwrapErr(
        await create.execute({ clientId: client.id, ...fields, currency: undefined }, TEST_AGENT),
      ).type,
    ).toBe('InvalidInput');
    expect(
      unwrapErr(await create.execute({ clientId: MISSING, operation: 'sale' }, TEST_AGENT)),
    ).toEqual({ type: 'ClientNotFound' });
    expect(
      unwrapErr(await create.execute({ clientId: trashed.id, operation: 'sale' }, TEST_AGENT)),
    ).toEqual({ type: 'ClientInTrash' });
    expect(uow.savedSearches.rows.size).toBe(0);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('stops at the limit of active searches per client', async () => {
    const { uow, client, create } = await setup();
    for (let i = 0; i < MAX_SAVED_SEARCHES_PER_CLIENT; i++) {
      seedSavedSearch(uow, {
        id: `00000000-0000-7000-8000-0000000006${i.toString().padStart(2, '0')}`,
        clientId: client.id,
      });
    }

    expect(
      unwrapErr(await create.execute({ clientId: client.id, operation: 'sale' }, TEST_AGENT)),
    ).toEqual({ type: 'SavedSearchLimitReached', max: MAX_SAVED_SEARCHES_PER_CLIENT });
  });

  it('needs to be able to edit the client', async () => {
    const { client, create } = await setup();
    const input: CreateSavedSearchInput = { clientId: client.id, operation: 'sale' };

    expect(unwrapErr(await create.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await create.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    unwrap(await create.execute(input, TEST_MANAGER));
  });
});

describe('UpdateSavedSearch', () => {
  async function withSearch() {
    const context = await setup();
    const { savedSearchId } = unwrap(
      await context.create.execute({ clientId: context.client.id, ...fields }, TEST_AGENT),
    );
    context.uow.audit.entries.length = 0;
    return { ...context, savedSearchId };
  }

  it('audits only the fields that changed', async () => {
    const { uow, client, update, savedSearchId } = await withSearch();

    unwrap(
      await update.execute(
        {
          clientId: client.id,
          savedSearchId,
          ...fields,
          maxPrice: '160000',
          locationIds: [PALERMO, BELGRANO],
        },
        TEST_AGENT,
      ),
    );

    expect(uow.savedSearches.rows.get(savedSearchId)?.locationIds).toEqual([PALERMO, BELGRANO]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'client.saved_search_updated',
        kind: 'updated',
        clientIds: [client.id],
        changes: {
          maxPriceCents: { before: 15_000_000n, after: 16_000_000n },
          locationIds: { before: [PALERMO], after: [PALERMO, BELGRANO] },
        },
      }),
    ]);
  });

  it('does not write or audit when nothing changed', async () => {
    const { uow, client, update, savedSearchId } = await withSearch();
    const before = uow.savedSearches.rows.get(savedSearchId);

    unwrap(await update.execute({ clientId: client.id, savedSearchId, ...fields }, TEST_AGENT));

    expect(uow.savedSearches.rows.get(savedSearchId)).toBe(before);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('rejects a search of another client, one in the trash and a missing one', async () => {
    const { uow, client, update, remove, savedSearchId } = await withSearch();
    const other = await seedClient(uow, { phones: ['+541147770099'] });

    expect(
      unwrapErr(await update.execute({ clientId: other.id, savedSearchId, ...fields }, TEST_AGENT)),
    ).toEqual({ type: 'SavedSearchNotFound' });
    expect(
      unwrapErr(
        await update.execute(
          { clientId: client.id, savedSearchId: MISSING, ...fields },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'SavedSearchNotFound' });
    unwrap(await remove.execute({ clientId: client.id, savedSearchId }, TEST_AGENT));
    expect(
      unwrapErr(
        await update.execute({ clientId: client.id, savedSearchId, ...fields }, TEST_AGENT),
      ),
    ).toEqual({ type: 'SavedSearchNotFound' });
  });

  it('does not turn auto-send back on after the client unsubscribed', async () => {
    const { uow, client, update } = await setup();
    const search = seedSavedSearch(uow, {
      id: '00000000-0000-7000-8000-0000000005b1',
      clientId: client.id,
      snapshot: { unsubscribedAt: clock.now() },
    });

    expect(
      unwrapErr(
        await update.execute(
          { clientId: client.id, savedSearchId: search.id, operation: 'sale', autoSend: true },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'SavedSearchUnsubscribed' });
  });

  it('needs to be able to edit the client', async () => {
    const { client, update, savedSearchId } = await withSearch();
    const input = { clientId: client.id, savedSearchId, ...fields };

    expect(unwrapErr(await update.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await update.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});

describe('DeleteSavedSearch and RestoreSavedSearch', () => {
  it('moves the search to the trash and back, auditing each once', async () => {
    const { uow, client, remove, restore } = await setup();
    const search = seedSavedSearch(uow, {
      id: '00000000-0000-7000-8000-0000000005c1',
      clientId: client.id,
    });
    const input = { clientId: client.id, savedSearchId: search.id };

    unwrap(await remove.execute(input, TEST_AGENT));
    unwrap(await remove.execute(input, TEST_AGENT));
    expect(uow.savedSearches.rows.get(search.id)).toMatchObject({
      deletedAt: clock.now(),
      deletedBy: TEST_AGENT.id,
    });
    unwrap(await restore.execute(input, TEST_AGENT));
    unwrap(await restore.execute(input, TEST_AGENT));
    expect(uow.savedSearches.rows.get(search.id)?.deletedAt).toBeUndefined();

    expect(uow.audit.entries.map((e) => [e.action, e.clientIds, e.changes])).toEqual([
      [
        'client.saved_search_deleted',
        [client.id],
        { savedSearchId: { before: search.id, after: search.id } },
      ],
      [
        'client.saved_search_restored',
        [client.id],
        { savedSearchId: { before: search.id, after: search.id } },
      ],
    ]);
  });

  it('does not restore past the limit of active searches', async () => {
    const { uow, client, restore } = await setup();
    const trashed = seedSavedSearch(uow, {
      id: '00000000-0000-7000-8000-0000000005c2',
      clientId: client.id,
      snapshot: { deletedAt: clock.now(), deletedBy: TEST_AGENT.id },
    });
    for (let i = 0; i < MAX_SAVED_SEARCHES_PER_CLIENT; i++) {
      seedSavedSearch(uow, {
        id: `00000000-0000-7000-8000-0000000006${i.toString().padStart(2, '0')}`,
        clientId: client.id,
      });
    }

    expect(
      unwrapErr(
        await restore.execute({ clientId: client.id, savedSearchId: trashed.id }, TEST_AGENT),
      ),
    ).toEqual({ type: 'SavedSearchLimitReached', max: MAX_SAVED_SEARCHES_PER_CLIENT });
  });

  it('rejects a search of another client and needs to edit the client', async () => {
    const { uow, client, remove, restore } = await setup();
    const other = await seedClient(uow, { phones: ['+541147770099'] });
    const search = seedSavedSearch(uow, {
      id: '00000000-0000-7000-8000-0000000005c3',
      clientId: client.id,
    });

    expect(
      unwrapErr(await remove.execute({ clientId: other.id, savedSearchId: search.id }, TEST_AGENT)),
    ).toEqual({ type: 'SavedSearchNotFound' });
    const input = { clientId: client.id, savedSearchId: search.id };
    expect(unwrapErr(await remove.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await restore.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(uow.audit.entries).toHaveLength(0);
  });
});

describe('GetSavedSearch', () => {
  it('returns the search with the names of the locations that still exist', async () => {
    const { client, create, get } = await setup();
    const { savedSearchId } = unwrap(
      await create.execute(
        { clientId: client.id, ...fields, locationIds: [PALERMO, BELGRANO] },
        TEST_AGENT,
      ),
    );

    expect(unwrap(await get.execute({ clientId: client.id, savedSearchId }, TEST_AGENT))).toEqual({
      id: savedSearchId,
      clientId: client.id,
      name: 'Depto en Palermo',
      opportunityId: undefined,
      operation: 'sale',
      propertyTypes: ['apartment'],
      currency: 'USD',
      minPriceCents: 10_000_000n,
      maxPriceCents: 15_000_000n,
      locations: [{ id: PALERMO, name: 'Palermo', hint: undefined }],
      minRooms: 2,
      autoSend: false,
      unsubscribed: false,
      deleted: false,
    });
  });

  it('needs to see the client, and the search must be its own', async () => {
    const { uow, client, get } = await setup();
    const other = await seedClient(uow, { phones: ['+541147770099'] });
    const search = seedSavedSearch(uow, {
      id: '00000000-0000-7000-8000-0000000005d1',
      clientId: client.id,
    });

    expect(
      unwrapErr(
        await get.execute({ clientId: client.id, savedSearchId: search.id }, TEST_OUTSIDER),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await get.execute({ clientId: other.id, savedSearchId: search.id }, TEST_AGENT)),
    ).toEqual({ type: 'SavedSearchNotFound' });
  });
});
