import { describe, expect, it } from 'vitest';

import { SignInInputSchema } from './index';

describe('SignInInputSchema', () => {
  it('accepts a valid email and password', () => {
    const result = SignInInputSchema.safeParse({ email: 'camila@norde.com', password: 'secret' });

    expect(result.success).toBe(true);
  });

  it('trims the email before validating it', () => {
    const result = SignInInputSchema.safeParse({ email: 'camila@norde.com ', password: 'secret' });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('camila@norde.com');
  });

  it('trims leading whitespace in the email', () => {
    const result = SignInInputSchema.safeParse({ email: '  camila@norde.com', password: 'secret' });

    expect(result.data?.email).toBe('camila@norde.com');
  });

  it('lowercases the email', () => {
    const result = SignInInputSchema.safeParse({ email: 'Camila@Norde.com', password: 'secret' });

    expect(result.data?.email).toBe('camila@norde.com');
  });

  it('rejects an email that is not valid once trimmed', () => {
    const result = SignInInputSchema.safeParse({ email: ' camila ', password: 'secret' });

    expect(result.success).toBe(false);
  });

  it('rejects an email longer than 254 characters', () => {
    const email = `${'a'.repeat(250)}@norde.com`;

    expect(SignInInputSchema.safeParse({ email, password: 'secret' }).success).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(SignInInputSchema.safeParse({ email: 'camila@norde.com', password: '' }).success).toBe(
      false,
    );
  });
});
