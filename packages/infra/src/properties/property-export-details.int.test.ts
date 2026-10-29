import { describe, expect, it } from 'vitest';

import { insertTestBranch, useTestDatabase } from '../../test/database';
import { branches, clientPhones, clients, properties, propertyOwners, users } from '../db/schema';

import { DrizzlePropertyExportDetails } from './drizzle-property-export-details';

const db = useTestDatabase();
const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');
const USER = '00000000-0000-7000-8000-0000000000a1';
const stamps = { createdAt: NOW, updatedAt: NOW, createdBy: USER, updatedBy: USER };
const WITH_OWNERS = '00000000-0000-7000-8000-0000000000e1';
const PLAIN = '00000000-0000-7000-8000-0000000000e2';
const FIRST_OWNER = '00000000-0000-7000-8000-0000000000c1';
const SECOND_OWNER = '00000000-0000-7000-8000-0000000000c2';
const TRASHED_OWNER = '00000000-0000-7000-8000-0000000000c3';

function aProperty(id: string, code: string) {
  return {
    id,
    code,
    slug: code.toLowerCase(),
    title: 'Departamento',
    propertyType: 'apartment',
    status: 'available',
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('DrizzlePropertyExportDetails', () => {
  it('reads the private address, the extra measures, the names and the first owner', async () => {
    const branchId = await insertTestBranch(db);
    await db.update(branches).set({ name: 'Centro' });
    await db.insert(users).values({
      id: USER,
      email: 'juan@example.com',
      name: 'Juan Gómez',
      branchId,
      ...stamps,
    });
    await db.insert(properties).values([
      {
        ...aProperty(WITH_OWNERS, 'DEP0001'),
        street: 'Gurruchaga',
        streetNumber: '1850',
        floor: '3',
        unit: 'B',
        toilets: 1,
        surfaceSemiCoveredM2: 6.5,
        frontM: 8.66,
        expensesCents: 8_500_000n,
        maintenanceUserId: USER,
        branchId,
      },
      { ...aProperty(PLAIN, 'DEP0002'), address: 'Thames 100' },
    ]);
    await db.insert(clients).values([
      { id: FIRST_OWNER, name: 'Ana Pérez', email: 'ana@example.com', ...stamps },
      { id: SECOND_OWNER, name: 'Luis Pérez', phoneE164: '+541148001111', ...stamps },
      { id: TRASHED_OWNER, name: 'Borrada', ...stamps, deletedAt: NOW, deletedBy: USER },
    ]);
    await db.insert(clientPhones).values({
      id: '00000000-0000-7000-9000-000000000001',
      clientId: FIRST_OWNER,
      kind: 'mobile',
      phoneE164: '+5491166660001',
      phoneMatchKey: '+5491166660001',
      position: 0,
      ...stamps,
    });
    await db.insert(propertyOwners).values([
      { propertyId: WITH_OWNERS, clientId: SECOND_OWNER, createdAt: LATER, createdBy: USER },
      { propertyId: WITH_OWNERS, clientId: FIRST_OWNER, createdAt: NOW, createdBy: USER },
      { propertyId: PLAIN, clientId: TRASHED_OWNER, createdAt: NOW, createdBy: USER },
    ]);
    const query = new DrizzlePropertyExportDetails(db);

    const details = await query.details([WITH_OWNERS, PLAIN], { includeOwners: true });

    expect(details.get(WITH_OWNERS)).toEqual({
      address: 'Gurruchaga 1850 3 B',
      toilets: 1,
      surfaceSemiCoveredM2: 6.5,
      surfaceLandM2: undefined,
      frontM: 8.66,
      depthM: undefined,
      expensesCents: 8_500_000n,
      maintenanceUser: 'Juan Gómez',
      branch: 'Centro',
      development: undefined,
      owner: { name: 'Ana Pérez', email: 'ana@example.com', mobile: '+5491166660001' },
    });
    expect(details.get(PLAIN)).toMatchObject({ address: 'Thames 100', owner: undefined });

    const withoutOwners = await query.details([WITH_OWNERS], { includeOwners: false });
    expect(withoutOwners.get(WITH_OWNERS)?.owner).toBeUndefined();
    expect(await query.details([], { includeOwners: true })).toEqual(new Map());
  });
});
