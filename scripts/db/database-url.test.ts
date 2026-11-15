import { describe, expect, it } from 'vitest';

import { isLocalDatabaseUrl, parseDatabaseUrl } from './database-url';

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

describe('isLocalDatabaseUrl', () => {
  it.each([
    'postgres://norde:norde@localhost:5432/norde',
    'postgres://norde:norde@127.0.0.1/norde_e2e',
    'postgres://norde:norde@[::1]:5432/norde',
    'postgres://norde:norde@LOCALHOST/norde',
    'postgres://norde@localhost/norde?host=/var/run/postgresql',
  ])('accepts a database on this machine: %s', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    'postgres://norde:s3cret@uat.norde.com.ar:5432/norde_uat',
    'postgres://norde:s3cret@10.0.0.5/norde',
    'postgres://norde:s3cret@localhost.evil.com/norde',
    // `pg` se conecta al `host` del parámetro, no al de la URL.
    'postgres://norde:s3cret@localhost/norde?host=uat.norde.com.ar',
  ])('rejects a remote database: %s', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });
});
