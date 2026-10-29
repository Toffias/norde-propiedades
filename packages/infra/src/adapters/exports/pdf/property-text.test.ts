import type { DocumentContact } from '@norde/core/properties';
import { describe, expect, it } from 'vitest';

import { contactLine, contactTextLines } from './property-text';

const BRANCH: DocumentContact = {
  name: 'Casa central',
  address: 'Av. Cabildo 1234',
  phone: '+541148001111',
  whatsapp: undefined,
  email: 'hola@norde.com.ar',
  text: undefined,
};

describe('contact in the PDFs', () => {
  it('prints the branch details when there is no free text', () => {
    expect(contactTextLines(BRANCH)).toBeUndefined();
    expect(contactLine(BRANCH)).toBe(
      'Av. Cabildo 1234 · Tel. +54 11 4800-1111 · hola@norde.com.ar',
    );
  });

  it('prints the free text instead, one line per row and without blank rows', () => {
    const contact = {
      ...BRANCH,
      text: ['Lunes a viernes de 9 a 18', '', '  Matrícula 1234 '].join('\n'),
    };

    expect(contactTextLines(contact)).toEqual(['Lunes a viernes de 9 a 18', 'Matrícula 1234']);
    expect(contactLine(contact)).toBe('Lunes a viernes de 9 a 18 · Matrícula 1234');
  });
});
