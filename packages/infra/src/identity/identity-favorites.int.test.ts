import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { users } from '../db/schema';

import { DrizzleUserFavorites } from './drizzle-user-favorites';

const db = useTestDatabase();
const favorites = new DrizzleUserFavorites(db);
const NOW = new Date('2026-10-01T12:00:00Z');
const USER = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const A = '00000000-0000-7000-8000-0000000000c1';
const B = '00000000-0000-7000-8000-0000000000c2';

async function aUser(id: string, email: string): Promise<void> {
  await db.insert(users).values({
    id,
    email,
    name: 'Usuario de prueba',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  });
}

describe('DrizzleUserFavorites', () => {
  it('adds, finds and removes the favorites of each user', async () => {
    await aUser(USER, 'uno@example.com');
    await aUser(OTHER, 'dos@example.com');

    await favorites.add(USER, 'property', [A, B], NOW);
    await favorites.add(USER, 'property', [A], NOW);
    await favorites.add(OTHER, 'property', [B], NOW);

    expect([...(await favorites.existing(USER, 'property', [A, B]))].sort()).toEqual([A, B]);
    expect(await favorites.existing(USER, 'client', [A])).toEqual([]);
    expect(await favorites.existing(OTHER, 'property', [A, B])).toEqual([B]);

    await favorites.remove(USER, 'property', [A]);
    expect(await favorites.existing(USER, 'property', [A, B])).toEqual([B]);
  });
});
