import { describe, expect, it } from 'vitest';

import { parseDatabaseUrl } from './database-url';

describe('parseDatabaseUrl', () => {
  it('extracts the database and builds the maintenance url', () => {
    const parsed = parseDatabaseUrl('postgres://norde:s3cret@localhost:5432/norde');

    expect(parsed.database).toBe('norde');
    expect(parsed.maintenanceUrl).toBe('postgres://norde:s3cret@localhost:5432/postgres');
  });

  it('never exposes the password in the redacted url', () => {
    const parsed = parseDatabaseUrl('postgresql://user:s3cret@db.local/app_dev');

    expect(parsed.redacted).not.toContain('s3cret');
    expect(parsed.redacted).toBe('postgresql://user:***@db.local/app_dev');
  });

  it('rejects unsafe database names and other protocols', () => {
    expect(() => parseDatabaseUrl('postgres://u:p@localhost/drop;table')).toThrow(/inválido/);
    expect(() => parseDatabaseUrl('mysql://u:p@localhost/app')).toThrow(/protocolo/);
  });
});
