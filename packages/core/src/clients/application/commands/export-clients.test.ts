import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import { MAX_CLIENT_EXPORT_ROWS } from '../../contracts';
import {
  aClientItem,
  AGENT_ID,
  BRANCH_ID,
  FakeClientExportWriter,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  StubClientListQuery,
  TEST_AGENT,
  TEST_MANAGER,
} from '../../testing';

import { ExportClients } from './export-clients';

const exporter = Actor.user(AGENT_ID, ['clients:read', 'clients:export']).withBranch(BRANCH_ID);

function setup(items = [aClientItem()]) {
  const uow = new InMemoryClientsUnitOfWork();
  const list = new StubClientListQuery(items);
  const writer = new FakeClientExportWriter();
  const useCase = new ExportClients({
    uow,
    list,
    agents: new InMemoryClientAgents(),
    writer,
    clock: new FixedClock('2026-03-01T10:00:00Z'),
  });
  return { uow, list, writer, useCase };
}

async function drain(body: AsyncIterable<Uint8Array>) {
  for await (const _chunk of body) {
    // La planilla se arma a medida que se lee.
  }
}

describe('ExportClients', () => {
  it('exports the filtered contacts by batches and audits the actor and the filters', async () => {
    const { uow, list, writer, useCase } = setup([
      aClientItem(),
      aClientItem({ id: '00000000-0000-7000-8000-0000000000d2', clientTypes: ['owner_landlord'] }),
    ]);

    const file = unwrap(await useCase.execute({ filter: { q: 'ana', owners: false } }, exporter));
    await drain(file.body);

    expect(writer.rows.map((r) => r.agent?.name)).toEqual(['Camila', 'Camila']);
    // Sin "Ver datos de propietarios", el propietario sale enmascarado.
    expect(writer.rows[1]).toMatchObject({ contactMasked: true, email: 'a•••@mail.com' });
    expect(list.counts[0]).toMatchObject({
      text: 'ana',
      visibility: { kind: 'own', ownerId: AGENT_ID },
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'client.exported',
        actorId: AGENT_ID,
        changes: {
          count: { before: null, after: 2 },
          filter: {
            before: null,
            after: { q: 'ana', owners: false, view: 'active' },
          },
        },
      }),
    ]);
  });

  it('reports nothing to export and too many rows', async () => {
    expect(unwrapErr(await setup([]).useCase.execute({ filter: {} }, exporter))).toEqual({
      type: 'NothingToExport',
    });

    const many = setup();
    many.list.count = () => Promise.resolve(MAX_CLIENT_EXPORT_ROWS + 1);
    expect(unwrapErr(await many.useCase.execute({ filter: {} }, exporter))).toEqual({
      type: 'TooManyToExport',
      max: MAX_CLIENT_EXPORT_ROWS,
      total: MAX_CLIENT_EXPORT_ROWS + 1,
    });
  });

  it('exports the trash only with a delete permission', async () => {
    const { useCase } = setup();
    expect(unwrapErr(await useCase.execute({ filter: { view: 'trash' } }, exporter))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await useCase.execute({ filter: { view: 'trash' } }, TEST_MANAGER));
  });

  it('rejects invalid filters', async () => {
    const { useCase } = setup();
    expect(
      unwrapErr(await useCase.execute({ filter: { agentId: 'not-an-id' } }, exporter)).type,
    ).toBe('InvalidInput');
  });

  it('cannot export without clients:export, even calling the action directly', async () => {
    const { uow, useCase } = setup();
    expect(unwrapErr(await useCase.execute({ filter: {} }, TEST_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(uow.audit.entries).toEqual([]);
  });
});
