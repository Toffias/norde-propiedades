import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  NO_RECORDS,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OUTSIDER,
} from '../../testing';
import { PreviewClientMerge } from '../queries/preview-client-merge';

import { MergeClients } from './merge-clients';

const clock = new FixedClock('2026-03-10T12:00:00Z');
const MISSING = '00000000-0000-7000-8000-0000000000ff';
/** Agente que además puede unificar sus contactos. */
const MERGER = Actor.user(AGENT_ID, [
  'clients:read',
  'clients:update',
  'clients:merge',
  'clients:read-owners',
]).withBranch(BRANCH_ID);

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const primary = await seedClient(uow, {
    name: 'Ana Pérez',
    phones: ['+5491166899124'],
    emails: ['ana@mail.com'],
  });
  const duplicate = await seedClient(uow, {
    name: 'Ana P.',
    phones: ['+541147770000'],
    emails: ['ana@acme.com'],
    clientTypes: ['investor'],
  });
  uow.records.counts.set(duplicate.id, {
    ...NO_RECORDS,
    opportunities: 2,
    activities: 14,
    savedSearches: 1,
    inquiries: 3,
  });
  uow.records.counts.set(primary.id, { ...NO_RECORDS, opportunities: 1 });
  return { uow, primary, duplicate, useCase: new MergeClients({ uow, clock }) };
}

describe('MergeClients', () => {
  it('moves everything to the principal and leaves the duplicate empty in the trash', async () => {
    const { uow, primary, duplicate, useCase } = await setup();

    const result = unwrap(
      await useCase.execute({ primaryId: primary.id, duplicateId: duplicate.id }, MERGER),
    );

    expect(result).toEqual({
      clientId: primary.id,
      moved: { ...NO_RECORDS, opportunities: 2, activities: 14, savedSearches: 1, inquiries: 3 },
    });
    const merged = uow.clients.rows.get(primary.id);
    expect(merged?.phones.map((p) => p.phone.e164)).toEqual(['+5491166899124', '+541147770000']);
    expect(merged?.emails.map((e) => e.email.value)).toEqual(['ana@mail.com', 'ana@acme.com']);
    expect(merged?.clientTypes).toEqual(['investor']);
    expect(uow.clients.rows.get(duplicate.id)).toMatchObject({
      phones: [],
      emails: [],
      mergedIntoId: primary.id,
      deletedBy: AGENT_ID,
    });
    // Nada se pierde: las oportunidades y la actividad del duplicado quedan en el principal.
    expect(uow.records.counts.get(primary.id)).toMatchObject({
      opportunities: 3,
      activities: 14,
      inquiries: 3,
    });
    expect(uow.records.moves).toEqual([{ fromId: duplicate.id, toId: primary.id }]);
    expect(uow.events.published.map((e) => e.type)).toEqual(['clients.clients_merged']);
  });

  it('audits the merge on both contacts with the diff and what moved', async () => {
    const { uow, primary, duplicate, useCase } = await setup();

    unwrap(await useCase.execute({ primaryId: primary.id, duplicateId: duplicate.id }, MERGER));

    const [onPrimary, onDuplicate] = uow.audit.entries;
    expect(onPrimary).toMatchObject({
      action: 'client.merged',
      entityId: primary.id,
      clientIds: [primary.id, duplicate.id],
      changes: {
        mergedClientId: { before: null, after: duplicate.id },
        clientTypes: { before: null, after: ['investor'] },
        'moved.opportunities': { before: null, after: 2 },
        'moved.activities': { before: null, after: 14 },
      },
    });
    expect(onPrimary?.changes).not.toHaveProperty('moved.featuredListings');
    expect(onDuplicate).toMatchObject({
      action: 'client.merged_into',
      entityId: duplicate.id,
      clientIds: [primary.id, duplicate.id],
      changes: {
        mergedIntoId: { before: null, after: primary.id },
        phones: { before: [{ kind: 'mobile', number: '+541147770000' }], after: null },
      },
    });
  });

  it('rejects merging a contact with itself, with one in the trash or one that does not exist', async () => {
    const { uow, primary, useCase } = await setup();
    const trashed = await seedClient(uow, { phones: ['+541147770009'], deleted: true });

    expect(
      unwrapErr(await useCase.execute({ primaryId: primary.id, duplicateId: primary.id }, MERGER))
        .type,
    ).toBe('InvalidInput');
    expect(
      unwrapErr(await useCase.execute({ primaryId: primary.id, duplicateId: trashed.id }, MERGER)),
    ).toEqual({ type: 'ClientInTrash' });
    expect(
      unwrapErr(await useCase.execute({ primaryId: primary.id, duplicateId: MISSING }, MERGER)),
    ).toEqual({ type: 'ClientNotFound' });
    expect(uow.audit.entries).toEqual([]);
  });

  it('needs clients:merge and to edit both contacts', async () => {
    const { uow, primary, duplicate, useCase } = await setup();
    const others = await seedClient(uow, {
      phones: ['+541147770008'],
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    const pair = { primaryId: primary.id, duplicateId: duplicate.id };

    expect(unwrapErr(await useCase.execute(pair, TEST_AGENT))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await useCase.execute(pair, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await useCase.execute({ primaryId: primary.id, duplicateId: others.id }, MERGER)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrap(await useCase.execute({ primaryId: primary.id, duplicateId: others.id }, TEST_MANAGER))
        .clientId,
    ).toBe(primary.id);
  });

  it('does not merge an owner whose data the actor cannot see', async () => {
    const { uow, primary, useCase } = await setup();
    const owner = await seedClient(uow, {
      phones: ['+541147770007'],
      clientTypes: ['owner_seller'],
    });
    const blind = Actor.user(AGENT_ID, ['clients:read', 'clients:update', 'clients:merge']);

    expect(
      unwrapErr(await useCase.execute({ primaryId: primary.id, duplicateId: owner.id }, blind)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('PreviewClientMerge', () => {
  it('shows both contacts with what hangs from each one', async () => {
    const { uow, primary, duplicate } = await setup();
    const useCase = new PreviewClientMerge({ uow, agents: new InMemoryClientAgents() });

    const preview = unwrap(
      await useCase.execute({ primaryId: primary.id, duplicateId: duplicate.id }, MERGER),
    );

    expect(preview.primary).toMatchObject({
      id: primary.id,
      name: 'Ana Pérez',
      phones: ['+5491166899124'],
      agent: { id: AGENT_ID, name: 'Camila' },
      records: { opportunities: 1 },
    });
    expect(preview.duplicate).toMatchObject({
      id: duplicate.id,
      emails: ['ana@acme.com'],
      records: { opportunities: 2, activities: 14 },
    });
  });

  it('uses the same permissions as merging', async () => {
    const { uow, primary, duplicate } = await setup();
    const useCase = new PreviewClientMerge({ uow, agents: new InMemoryClientAgents() });
    const pair = { primaryId: primary.id, duplicateId: duplicate.id };

    expect(unwrapErr(await useCase.execute(pair, TEST_AGENT))).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await useCase.execute({ primaryId: primary.id, duplicateId: MISSING }, MERGER)),
    ).toEqual({ type: 'ClientNotFound' });
  });
});
