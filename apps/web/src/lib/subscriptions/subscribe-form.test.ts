import { describe, expect, it } from 'vitest';

import { parseSubscribeForm, SUBSCRIBE_FIELDS as F } from './subscribe-form';

function form(values: Partial<Record<keyof typeof F, string>>): FormData {
  const data = new FormData();
  const all = {
    name: 'Ana Pérez',
    email: 'ana@example.com',
    frequency: 'weekly',
    operation: '',
    search: 'operacion=venta',
    honeypot: '',
    ...values,
  };
  data.set(F.name, all.name);
  data.set(F.email, all.email);
  data.set(F.frequency, all.frequency);
  data.set(F.operation, all.operation);
  data.set(F.search, all.search);
  data.set(F.honeypot, all.honeypot);
  return data;
}

describe('parseSubscribeForm', () => {
  it('accepts a valid request', () => {
    expect(parseSubscribeForm(form({}))).toEqual({
      kind: 'valid',
      data: {
        name: 'Ana Pérez',
        email: 'ana@example.com',
        frequency: 'weekly',
        operation: undefined,
        search: 'operacion=venta',
      },
    });
  });

  it('marks each invalid field and keeps what was written', () => {
    const parsed = parseSubscribeForm(form({ name: 'A', email: 'ana@', frequency: 'daily' }));

    expect(parsed).toMatchObject({
      kind: 'invalid',
      state: {
        fieldErrors: {
          name: 'Escribí tu nombre.',
          email: 'Revisá el email.',
          frequency: 'Elegí cada cuánto querés recibirlas.',
        },
        values: { name: 'A', email: 'ana@' },
      },
    });
  });

  it('accepts a chosen operation and rejects an unknown one', () => {
    const chosen = parseSubscribeForm(form({ operation: 'rent' }));
    expect(chosen.kind === 'valid' && chosen.data.operation).toBe('rent');
    expect(parseSubscribeForm(form({ operation: 'swap' })).kind).toBe('invalid');
  });

  it('spots a bot by the honeypot', () => {
    expect(parseSubscribeForm(form({ honeypot: 'https://spam.example' }))).toEqual({ kind: 'bot' });
  });
});
