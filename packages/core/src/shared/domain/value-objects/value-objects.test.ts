import { describe, expect, it } from 'vitest';

import { Email } from './email';
import { Phone } from './phone';

function phone(raw: string): Phone {
  const result = Phone.create(raw);
  if (result.isErr()) throw new Error(`invalid phone in test: ${raw}`);
  return result.value;
}

describe('Phone', () => {
  it('normalizes international and Argentine national formats to E.164', () => {
    expect(phone('+54 9 11 6689-9124').e164).toBe('+5491166899124');
    expect(phone('011 15 6689-9124').e164).toBe('+5491166899124');
    expect(phone('0351 15 555 1234').e164).toBe('+5493515551234');
    expect(phone('+34 612 345 678').e164).toBe('+34612345678');
  });

  it('accepts the WhatsApp id format (digits without +)', () => {
    expect(phone('5491166899124').e164).toBe('+5491166899124');
  });

  it('treats an Argentine mobile with and without the 9 as the same contact', () => {
    const fromWhatsApp = phone('+5491166899124');
    const fromForm = phone('11 6689 9124');

    expect(fromWhatsApp.e164).not.toBe(fromForm.e164);
    expect(fromWhatsApp.sameContactAs(fromForm)).toBe(true);
    expect(fromWhatsApp.matchKey).toBe('+541166899124');
  });

  it('does not match different numbers', () => {
    expect(phone('+5491166899124').sameContactAs(phone('+5491166899125'))).toBe(false);
  });

  it('rejects invalid numbers', () => {
    expect(Phone.create('12').isErr()).toBe(true);
    expect(Phone.create('hola').isErr()).toBe(true);
    expect(Phone.create('').isErr()).toBe(true);
  });
});

describe('Email', () => {
  it('normalizes case and spaces', () => {
    const result = Email.create('  Juan.Perez@Mail.COM ');

    expect(result.isOk() && result.value.value).toBe('juan.perez@mail.com');
  });

  it('rejects malformed addresses', () => {
    expect(Email.create('juan@').isErr()).toBe(true);
    expect(Email.create('juan perez@mail.com').isErr()).toBe(true);
    expect(Email.create(`${'a'.repeat(250)}@b.com`).isErr()).toBe(true);
  });
});
