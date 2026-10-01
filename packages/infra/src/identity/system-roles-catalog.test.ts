import { readFileSync } from 'node:fs';
import path from 'node:path';

import { isKnownPermission } from '@norde/core/identity';
import { describe, expect, it } from 'vitest';

// Los roles de sistema se siembran por SQL: si un permiso de la migración no está en el catálogo
// del core, no se podría ver ni editar desde el ABM de roles.

const MIGRATIONS = path.resolve(import.meta.dirname, '../db/migrations');
const SEEDED_PERMISSION = /\('[a-z-]+', '([a-z-]+:[a-z*-]+)'\)/g;

function seededPermissions(file: string): string[] {
  const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
  return [...sql.matchAll(SEEDED_PERMISSION)].map((match) => match[1] ?? '');
}

describe('system roles', () => {
  it('only seed permissions of the catalog', () => {
    const permissions = [
      ...seededPermissions('0002_system_roles.sql'),
      ...seededPermissions('0005_catalog_permissions_for_system_roles.sql'),
    ];

    expect(permissions.length).toBeGreaterThan(50);
    expect(permissions.filter((permission) => !isKnownPermission(permission))).toEqual([]);
  });
});
