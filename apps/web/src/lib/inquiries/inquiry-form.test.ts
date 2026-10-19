import { describe, expect, it } from 'vitest';

import { INQUIRY_FIELDS as F, parseInquiryForm } from './inquiry-form';

const PROPERTY_ID = '00000000-0000-7000-8000-0000000000c1';

function form(values: {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly message?: string;
  readonly honeypot?: string;
  /** `null`: el formulario no manda el campo (contacto, tasaciones). */
  readonly propertyId?: string | null;
}): FormData {
  const data = new FormData();
  data.set(F.name, values.name ?? 'Ana Pérez');
  data.set(F.email, values.email ?? '');
  data.set(F.phone, values.phone ?? '');
  data.set(F.message, values.message ?? 'Quiero visitarla');
  const propertyId = values.propertyId === undefined ? PROPERTY_ID : values.propertyId;
  if (propertyId !== null) data.set(F.propertyId, propertyId);
  data.set(F.honeypot, values.honeypot ?? '');
  return data;
}

describe('parseInquiryForm', () => {
  it('accepts a phone or an email and drops empty optional fields', () => {
    expect(parseInquiryForm(form({ phone: '11 6689-9124', email: ' ' }))).toEqual({
      kind: 'valid',
      data: {
        name: 'Ana Pérez',
        phone: '11 6689-9124',
        email: undefined,
        message: 'Quiero visitarla',
        propertyId: PROPERTY_ID,
      },
    });
  });

  it('accepts an inquiry without a property, as the contact and appraisal forms send it', () => {
    expect(parseInquiryForm(form({ phone: '1166899124', propertyId: null }))).toMatchObject({
      kind: 'valid',
      data: { propertyId: undefined },
    });
    expect(parseInquiryForm(form({ phone: '1166899124', propertyId: '' }))).toMatchObject({
      kind: 'valid',
      data: { propertyId: undefined },
    });
  });

  it('rejects a property ID that is not a UUID', () => {
    expect(parseInquiryForm(form({ phone: '1166899124', propertyId: 'x' }))).toMatchObject({
      kind: 'invalid',
    });
  });

  it('asks for a way to answer and marks each invalid field', () => {
    const parsed = parseInquiryForm(form({ name: 'A', message: ' ' }));
    expect(parsed).toMatchObject({
      kind: 'invalid',
      state: {
        status: 'error',
        // Lo escrito vuelve con el error: el formulario no se borra.
        values: { name: 'A', email: '', phone: '', message: ' ' },
        fieldErrors: {
          name: 'Escribí tu nombre.',
          message: 'Escribí tu consulta.',
          phone: 'Dejanos un teléfono o un email para responderte.',
        },
      },
    });
    expect(parseInquiryForm(form({ email: 'no-es-un-email' }))).toMatchObject({
      kind: 'invalid',
      state: { fieldErrors: { email: 'Revisá el email.' } },
    });
  });

  it('spots a bot that filled the hidden field', () => {
    expect(parseInquiryForm(form({ phone: '1166899124', honeypot: 'https://spam' }))).toEqual({
      kind: 'bot',
    });
  });
});
