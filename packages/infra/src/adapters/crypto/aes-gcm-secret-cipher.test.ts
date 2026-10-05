import { describe, expect, it } from 'vitest';

import { AesGcmSecretCipher } from './aes-gcm-secret-cipher';

// Claves de prueba: 32 bytes en base64, sin uso real.
const KEY = Buffer.alloc(32, 7).toString('base64'); // gitleaks:allow
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64'); // gitleaks:allow

describe('AesGcmSecretCipher', () => {
  it('decrypts what it encrypted', () => {
    const cipher = new AesGcmSecretCipher(KEY);
    const secret = JSON.stringify({ accessToken: 'APP_USR-123', refreshToken: 'TG-456' });

    const encrypted = cipher.encrypt(secret);

    expect(encrypted.toString('utf8')).not.toContain('APP_USR');
    expect(cipher.decrypt(encrypted)).toBe(secret);
  });

  it('uses a new IV each time', () => {
    const cipher = new AesGcmSecretCipher(KEY);
    expect(cipher.encrypt('same').equals(cipher.encrypt('same'))).toBe(false);
  });

  it('rejects a value encrypted with another key', () => {
    const encrypted = new AesGcmSecretCipher(OTHER_KEY).encrypt('secret');
    expect(() => new AesGcmSecretCipher(KEY).decrypt(encrypted)).toThrow();
  });

  it('rejects a tampered value', () => {
    const cipher = new AesGcmSecretCipher(KEY);
    const encrypted = cipher.encrypt('secret');
    encrypted[encrypted.length - 1] = (encrypted.at(-1) ?? 0) ^ 0xff;
    expect(() => cipher.decrypt(encrypted)).toThrow();
  });

  it('rejects an unknown format', () => {
    expect(() => new AesGcmSecretCipher(KEY).decrypt(Buffer.from([2, 0, 0]))).toThrow(
      'Unknown secret format',
    );
  });

  it('requires a 32-byte key', () => {
    expect(() => new AesGcmSecretCipher(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});
