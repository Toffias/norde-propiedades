import { describe, expect, it } from 'vitest';

import { isWeakSecret, parseEnv } from './env';

const STRONG = 'f3Kq9xP2vL7mN4tR8wY1zB6cD0hJ5sG2';

function env(overrides: Record<string, string | undefined>) {
  return {
    DATABASE_URL: 'postgres://norde:norde@localhost:5432/norde',
    NEXT_PUBLIC_SERVER_URL: 'http://localhost:3000',
    PAYLOAD_SECRET: STRONG,
    ...overrides,
  };
}

describe('isWeakSecret', () => {
  it('flags the old .env.example value, placeholders and repetitive strings', () => {
    expect(isWeakSecret('cambiar-por-un-secreto-largo-y-aleatorio')).toBe(true);
    expect(isWeakSecret('changeme-changeme-changeme-changeme')).toBe(true);
    expect(isWeakSecret('a'.repeat(40))).toBe(true);
    expect(isWeakSecret('1234'.repeat(10))).toBe(true);
  });

  it('accepts a random secret', () => {
    expect(isWeakSecret(STRONG)).toBe(false);
  });
});

describe('parseEnv', () => {
  it('rejects the old example PAYLOAD_SECRET in production', () => {
    expect(() =>
      parseEnv(
        env({ NODE_ENV: 'production', PAYLOAD_SECRET: 'cambiar-por-un-secreto-largo-y-aleatorio' }),
      ),
    ).toThrow(/PAYLOAD_SECRET/);
  });

  it('rejects an empty PAYLOAD_SECRET, the new example value', () => {
    expect(() => parseEnv(env({ PAYLOAD_SECRET: '' }))).toThrow(/PAYLOAD_SECRET/);
  });

  it('accepts a strong secret in production', () => {
    expect(parseEnv(env({ NODE_ENV: 'production', STORAGE_DRIVER: 'local' })).PAYLOAD_SECRET).toBe(
      STRONG,
    );
  });

  it('keeps accepting a weak secret outside production, for local setups', () => {
    const secret = 'cambiar-por-un-secreto-largo-y-aleatorio';
    expect(parseEnv(env({ PAYLOAD_SECRET: secret })).PAYLOAD_SECRET).toBe(secret);
  });
});
