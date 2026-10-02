import { describe, expect, it } from 'vitest';

import { parseId, Phone } from '../../shared';

import { Client } from './client';
import { clientsToErase, confirmsErasure, erasureRecord } from './client-erasure';

function aClient(name: string): Client {
  const phone = Phone.create('+5491166899124');
  const id = parseId<'Client'>('00000000-0000-7000-8000-000000000001');
  if (phone.isErr() || id.isErr()) throw new Error('Invalid test fixture');
  const created = Client.create({
    id: id.value,
    kind: 'person',
    name,
    phones: [{ kind: 'mobile', phone: phone.value, contactHours: undefined }],
    emails: [],
    clientTypes: [],
    agentId: undefined,
    branchId: undefined,
    profile: {},
    now: new Date('2026-01-01T00:00:00Z'),
  });
  if (created.isErr()) throw new Error('Invalid test client');
  return created.value;
}

/** Los que entran por un canal pueden no tener nombre. */
function aNamelessClient(): Client {
  return Client.restore({ ...aClient('Ana').toSnapshot(), name: undefined });
}

describe('confirmsErasure', () => {
  it('accepts the contact name without caring about case, accents or spaces', () => {
    const client = aClient('Ana Pérez');

    expect(confirmsErasure(client, '  ana   perez ')).toBe(true);
    expect(confirmsErasure(client, 'Ana')).toBe(false);
    expect(confirmsErasure(client, 'suprimir')).toBe(false);
  });

  it('asks for the word "suprimir" when the contact has no name', () => {
    const client = aNamelessClient();

    expect(confirmsErasure(client, 'SUPRIMIR')).toBe(true);
    expect(confirmsErasure(client, '')).toBe(false);
  });
});

describe('clientsToErase', () => {
  it('includes the contact and its merged duplicates once', () => {
    const client = aClient('Ana');

    expect(clientsToErase(client, ['m1', client.id, 'm2'])).toEqual([client.id, 'm1', 'm2']);
  });
});

describe('erasureRecord', () => {
  const now = new Date('2026-10-02T15:00:00Z');

  it('keeps when it was requested, who ran it and when, without personal data', () => {
    const record = erasureRecord({
      id: 'r1',
      clientId: 'c1',
      requestedAt: new Date('2026-09-30T03:00:00Z'),
      executedBy: 'u1',
      now,
    });

    expect(record.isOk() && record.value).toEqual({
      id: 'r1',
      erasedEntityType: 'client',
      erasedEntityId: 'c1',
      requestedAt: new Date('2026-09-30T03:00:00Z'),
      executedBy: 'u1',
      executedAt: now,
    });
  });

  it('rejects a request dated after the erasure', () => {
    const record = erasureRecord({
      id: 'r1',
      clientId: 'c1',
      requestedAt: new Date('2026-10-03T03:00:00Z'),
      executedBy: 'u1',
      now,
    });

    expect(record.isErr() && record.error).toEqual({ type: 'ErasureRequestInFuture' });
  });
});
