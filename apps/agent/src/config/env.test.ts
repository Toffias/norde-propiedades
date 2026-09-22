import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

const DATABASE_URL = 'postgres://norde:norde@localhost:5432/norde';

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv({ DATABASE_URL });

    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 3100, LOG_LEVEL: 'info' });
  });

  it('treats blank values as unset', () => {
    expect(parseEnv({ DATABASE_URL, PORT: '  ' }).PORT).toBe(3100);
  });

  it('coerces numbers', () => {
    expect(parseEnv({ DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it('fails fast on missing or invalid values', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
