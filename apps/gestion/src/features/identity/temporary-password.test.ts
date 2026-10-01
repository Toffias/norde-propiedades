import { MIN_PASSWORD_LENGTH } from '@norde/core/identity/contracts';
import { describe, expect, it } from 'vitest';

import { generateTemporaryPassword } from './temporary-password';

describe('generateTemporaryPassword', () => {
  it('is long enough for the sign-in and avoids characters that look alike', () => {
    const password = generateTemporaryPassword();

    expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(password).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]+$/);
  });

  it('is different every time', () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });
});
