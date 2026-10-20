import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../shared/testing';

import { readImportExtras, readImportRow } from './client-import-row';

const MAPPING = {
  name: 0,
  companyName: 1,
  mobile: 2,
  email: 3,
  clientTypes: 4,
  birthDate: 5,
  kind: 6,
} as const;

const FIELDS = [
  'name',
  'companyName',
  'mobile',
  'email',
  'clientTypes',
  'birthDate',
  'kind',
] as const;

/** Las celdas en el orden del mapeo. */
function row(cells: Partial<Record<(typeof FIELDS)[number], string>>): (string | undefined)[] {
  return FIELDS.map((field) => cells[field]);
}

describe('readImportRow', () => {
  it('reads a contact with its phones, emails, types and profile', () => {
    const client = unwrap(
      readImportRow(
        row({
          name: ' Ana Pérez ',
          companyName: 'Acme',
          mobile: '+54 9 11 6689-9124',
          email: 'ANA@mail.com',
          clientTypes: 'Comprador; inversor',
          birthDate: '7/3/1990',
        }),
        MAPPING,
      ),
    );

    expect(client).toMatchObject({
      kind: 'person',
      name: 'Ana Pérez',
      clientTypes: ['buyer', 'investor'],
      profile: { companyName: 'Acme', birthDate: '1990-03-07' },
    });
    expect(client.phones.map((p) => [p.kind, p.phone.e164])).toEqual([
      ['mobile', '+5491166899124'],
    ]);
    expect(client.emails.map((e) => [e.kind, e.email.value])).toEqual([['main', 'ana@mail.com']]);
  });

  it('uses the company as the name of a company without a person name', () => {
    const client = unwrap(
      readImportRow(row({ companyName: 'Acme SA', email: 'a@acme.com' }), MAPPING),
    );

    expect(client).toMatchObject({ kind: 'company', name: 'Acme SA' });
    expect(client.profile.companyName).toBeUndefined();
  });

  it('reads the kind by its label', () => {
    const client = unwrap(
      readImportRow(
        row({ name: 'Familia López', kind: 'grupo de contactos', email: 'f@l.com' }),
        MAPPING,
      ),
    );
    expect(client.kind).toBe('group');
  });

  it('reports the problem of each row without its data', () => {
    expect(unwrapErr(readImportRow(row({ email: 'a@b.com' }), MAPPING))).toEqual({
      code: 'missing_name',
      field: undefined,
    });
    expect(unwrapErr(readImportRow(row({ name: 'Ana' }), MAPPING))).toEqual({
      code: 'missing_contact',
      field: undefined,
    });
    expect(unwrapErr(readImportRow(row({ name: 'Ana', mobile: '123' }), MAPPING))).toEqual({
      code: 'invalid_phone',
      field: 'mobile',
    });
    expect(unwrapErr(readImportRow(row({ name: 'Ana', email: 'ana@' }), MAPPING))).toEqual({
      code: 'invalid_email',
      field: 'email',
    });
    expect(
      unwrapErr(
        readImportRow(row({ name: 'Ana', email: 'a@b.com', clientTypes: 'Vecino' }), MAPPING),
      ),
    ).toEqual({ code: 'invalid_value', field: 'clientTypes' });
    expect(
      unwrapErr(
        readImportRow(row({ name: 'Ana', email: 'a@b.com', birthDate: '30/02/1990' }), MAPPING),
      ),
    ).toEqual({ code: 'invalid_value', field: 'birthDate' });
    expect(
      unwrapErr(readImportRow(row({ name: 'Ana', email: 'a@b.com', kind: 'Socio' }), MAPPING)),
    ).toEqual({ code: 'invalid_value', field: 'kind' });
    expect(
      unwrapErr(readImportRow(row({ name: 'x'.repeat(121), email: 'a@b.com' }), MAPPING)),
    ).toEqual({ code: 'invalid_value', field: 'name' });
  });

  it('ignores columns that are not mapped', () => {
    const client = unwrap(readImportRow(['Ana', 'a@b.com', 'basura'], { name: 0, email: 1 }));
    expect(client.name).toBe('Ana');
  });
});

describe('Tokko rows', () => {
  const TOKKO = {
    externalId: 0,
    name: 1,
    phone: 2,
    otherPhone: 3,
    birthDate: 4,
    email: 5,
    agent: 6,
    tags: 7,
  } as const;

  it('takes the dash Tokko leaves in empty cells as empty, and reads the other phone', () => {
    const client = unwrap(
      readImportRow(
        ['48213307', 'Ana', '-', '011 4777-0000', '-', '---', 'Camila Pedro', '-'],
        TOKKO,
      ),
    );

    expect(client.phones.map((p) => [p.kind, p.phone.e164])).toEqual([['other', '+541147770000']]);
    expect(client.emails).toEqual([]);
    expect(client.profile.birthDate).toBeUndefined();
  });

  it('reads the Tokko ID, the agent and the tags without repeating them', () => {
    expect(
      unwrap(
        readImportExtras(
          [
            ' 48213307 ',
            'Ana',
            undefined,
            undefined,
            '-',
            undefined,
            ' Camila Pedro ',
            'Web | Venta |  web | Ramos Mejía,Consulta | -',
          ],
          TOKKO,
        ),
      ),
    ).toEqual({
      externalId: '48213307',
      agentName: 'Camila Pedro',
      tagNames: ['Web', 'Venta', 'Ramos Mejía', 'Consulta'],
    });
    expect(unwrap(readImportExtras(['-', 'Ana'], TOKKO))).toEqual({
      externalId: undefined,
      agentName: undefined,
      tagNames: [],
    });
  });

  it('cuts long tag names like the tag does, and rejects too many tags or a long ID', () => {
    const long = 'x'.repeat(70);
    expect(
      unwrap(readImportExtras(['1', 'Ana', ...Array<undefined>(5), long], TOKKO)).tagNames,
    ).toEqual(['x'.repeat(60)]);

    const many = Array.from({ length: 51 }, (_, i) => `Etiqueta ${String(i)}`).join(' | ');
    expect(unwrapErr(readImportExtras(['1', 'Ana', ...Array<undefined>(5), many], TOKKO))).toEqual({
      code: 'invalid_value',
      field: 'tags',
    });
    expect(unwrapErr(readImportExtras(['9'.repeat(101), 'Ana'], TOKKO))).toEqual({
      code: 'invalid_value',
      field: 'externalId',
    });
  });
});
