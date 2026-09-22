import { describe, expect, it } from 'vitest';

import { parseEnv, whatsAppConfig } from './env';

const DATABASE_URL = 'postgres://norde:norde@localhost:5432/norde';
const WHATSAPP = {
  WHATSAPP_ACCESS_TOKEN: 'token',
  WHATSAPP_PHONE_NUMBER_ID: 'PNID',
  WHATSAPP_VERIFY_TOKEN: 'verify',
  WHATSAPP_APP_SECRET: 'secret',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv({ DATABASE_URL });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3100,
      LOG_LEVEL: 'info',
      OPENAI_MODEL: 'gpt-5-mini',
      WHATSAPP_STRIP_AR_NINE: false,
      JOBS_ENABLED: true,
    });
  });

  it('treats blank values as unset', () => {
    expect(parseEnv({ DATABASE_URL, PORT: '  ', WHATSAPP_ACCESS_TOKEN: '' }).PORT).toBe(3100);
  });

  it('coerces numbers and booleans', () => {
    const env = parseEnv({ DATABASE_URL, PORT: '8080', WHATSAPP_STRIP_AR_NINE: 'true' });

    expect(env.PORT).toBe(8080);
    expect(env.WHATSAPP_STRIP_AR_NINE).toBe(true);
  });

  it('fails fast on missing or invalid values', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('runs without WhatsApp, and enables it only with all four credentials', () => {
    expect(whatsAppConfig(parseEnv({ DATABASE_URL }))).toBeUndefined();
    expect(
      whatsAppConfig(parseEnv({ DATABASE_URL, ...WHATSAPP, OPENAI_API_KEY: 'sk-test' })),
    ).toEqual({
      accessToken: 'token',
      phoneNumberId: 'PNID',
      verifyToken: 'verify',
      appSecret: 'secret',
    });
  });

  it('rejects a partial WhatsApp configuration or one without the AI agent', () => {
    expect(() => parseEnv({ DATABASE_URL, WHATSAPP_ACCESS_TOKEN: 'token' })).toThrow(
      /WHATSAPP_APP_SECRET/,
    );
    expect(() => parseEnv({ DATABASE_URL, ...WHATSAPP })).toThrow(/OPENAI_API_KEY/);
  });
});
