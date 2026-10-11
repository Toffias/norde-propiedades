import { describe, expect, it } from 'vitest';

import { DEFAULT_E2E_DATABASE_URL, e2eDatabaseUrl, readE2eEnv } from './e2e-database';

describe('e2eDatabaseUrl', () => {
  it('uses the default local database when nothing else is configured', () => {
    expect(e2eDatabaseUrl({})).toBe(DEFAULT_E2E_DATABASE_URL);
  });

  it('derives the database from the development one with the _e2e suffix', () => {
    const url = e2eDatabaseUrl({}, 'postgres://dev:s3cret@localhost:5433/norde');

    expect(url).toBe('postgres://dev:s3cret@localhost:5433/norde_e2e');
  });

  it('prefers an explicit E2E_DATABASE_URL', () => {
    const explicit = 'postgres://ci:ci@db:5432/gestion_e2e';

    expect(e2eDatabaseUrl({ E2E_DATABASE_URL: explicit }, 'postgres://x:y@h/norde')).toBe(explicit);
  });

  it('ignores DATABASE_URL so it never resets the development database', () => {
    const url = e2eDatabaseUrl({ DATABASE_URL: 'postgres://norde:norde@localhost:5432/norde' });

    expect(url).toBe(DEFAULT_E2E_DATABASE_URL);
  });

  it('rejects an explicit database whose name does not end in _e2e', () => {
    expect(() =>
      e2eDatabaseUrl({ E2E_DATABASE_URL: 'postgres://norde:norde@localhost:5432/norde' }),
    ).toThrow(/_e2e/);
  });

  it('refuses to run in production', () => {
    expect(() => e2eDatabaseUrl({ NODE_ENV: 'production' })).toThrow(/solo para desarrollo/);
  });
});

describe('readE2eEnv', () => {
  it('serves the dev server locally and the production build in CI', () => {
    expect(readE2eEnv({}).server).toBe('dev');
    expect(readE2eEnv({ CI: 'true' })).toMatchObject({ ci: true, server: 'start' });
  });

  it('lets E2E_SERVER choose the server explicitly', () => {
    expect(readE2eEnv({ CI: 'true', E2E_SERVER: 'dev' }).server).toBe('dev');
  });

  it('rejects an unknown server mode', () => {
    expect(() => readE2eEnv({ E2E_SERVER: 'preview' })).toThrow();
  });
});
