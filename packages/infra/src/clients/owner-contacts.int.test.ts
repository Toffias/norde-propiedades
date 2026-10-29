import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { clientPhones, clients } from '../db/schema';

import { DrizzleOwnerContacts } from './drizzle-owner-contacts';

const db = useTestDatabase();
const USER = '00000000-0000-7000-8000-0000000000a1';
const NOW = new Date('2026-10-01T12:00:00Z');
const stamps = { createdAt: NOW, updatedAt: NOW, createdBy: USER, updatedBy: USER };
const ANA = '00000000-0000-7000-8000-0000000000c1';
const TRASHED = '00000000-0000-7000-8000-0000000000c2';
const MERGED = '00000000-0000-7000-8000-0000000000c3';

function phone(id: string, clientId: string, kind: string, phoneE164: string, position: number) {
  return {
    id,
    clientId,
    kind,
    phoneE164,
    phoneMatchKey: phoneE164,
    position,
    ...stamps,
  };
}

describe('DrizzleOwnerContacts', () => {
  it('finds the main phone, the first mobile and the email of an owner', async () => {
    await db.insert(clients).values([
      {
        id: ANA,
        name: 'Ana Pérez',
        phoneE164: '+541148001111',
        email: 'ana@example.com',
        ...stamps,
      },
      { id: TRASHED, name: 'En la papelera', ...stamps, deletedAt: NOW, deletedBy: USER },
      { id: MERGED, name: 'Unificado', ...stamps, mergedIntoId: ANA },
    ]);
    await db
      .insert(clientPhones)
      .values([
        phone('00000000-0000-7000-9000-000000000001', ANA, 'work', '+541148002222', 0),
        phone('00000000-0000-7000-9000-000000000002', ANA, 'mobile', '+5491166660002', 2),
        phone('00000000-0000-7000-9000-000000000003', ANA, 'mobile', '+5491166660001', 1),
      ]);
    const contacts = new DrizzleOwnerContacts(db);

    expect(await contacts.find(ANA)).toEqual({
      name: 'Ana Pérez',
      phone: '+541148001111',
      mobile: '+5491166660001',
      email: 'ana@example.com',
    });
    expect(await contacts.find(TRASHED)).toBeUndefined();
    expect(await contacts.find(MERGED)).toBeUndefined();
    expect(await contacts.find('not-a-uuid')).toBeUndefined();
  });
});
