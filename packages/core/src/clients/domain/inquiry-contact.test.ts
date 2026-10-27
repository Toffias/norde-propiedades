import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../shared/testing';

import { inquiryContact } from './inquiry-contact';

describe('inquiryContact', () => {
  it('keeps a valid phone and email as they are', () => {
    const contact = unwrap(
      inquiryContact({ phone: '+54 9 11 6689-9124', email: 'ana@example.com', message: 'Hola' }),
    );
    expect(contact.phone?.e164).toBe('+5491166899124');
    expect(contact.email?.value).toBe('ana@example.com');
    expect(contact.message).toBe('Hola');
  });

  it('writes an invalid phone in the message when the email is valid', () => {
    const contact = unwrap(
      inquiryContact({ phone: '4444-5555', email: 'ana@example.com', message: undefined }),
    );
    expect(contact.phone).toBeUndefined();
    expect(contact.message).toBe('Teléfono que dejó (no se pudo validar): 4444-5555');
  });

  it('writes an invalid email in the message when the phone is valid', () => {
    const contact = unwrap(
      inquiryContact({ phone: '+5491166899124', email: 'ana@', message: 'Hola' }),
    );
    expect(contact.email).toBeUndefined();
    expect(contact.message).toBe('Hola\n\nEmail que dejó (no se pudo validar): ana@');
  });

  it('rejects when no contact data is valid', () => {
    expect(
      unwrapErr(inquiryContact({ phone: '4444', email: 'ana@', message: undefined })).type,
    ).toBe('InvalidPhone');
    expect(
      unwrapErr(inquiryContact({ phone: undefined, email: 'ana@', message: undefined })).type,
    ).toBe('InvalidEmail');
  });
});
