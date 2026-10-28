import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../shared/testing';

import {
  fillVariables,
  firstNameOf,
  MAX_QUICK_REPLY_BODY_LENGTH,
  QuickReply,
  unknownVariables,
  type QuickReplyId,
} from './quick-reply';

const ID = '00000000-0000-7000-8000-0000000000a1' as QuickReplyId;
const NOW = new Date('2026-03-01T10:00:00Z');
const LATER = new Date('2026-03-02T10:00:00Z');

function create(overrides: Partial<Parameters<typeof QuickReply.create>[0]> = {}) {
  return QuickReply.create({
    id: ID,
    name: 'Primer contacto',
    subject: 'Hola [[primer_nombre_contacto]]',
    body: 'Soy [[nombre_asesor]], de [[nombre_empresa]].',
    now: NOW,
    ...overrides,
  });
}

describe('QuickReply', () => {
  it('is born active, with its text trimmed', () => {
    const reply = unwrap(create({ name: '  Primer   contacto ', subject: '  ', body: ' Hola ' }));

    expect(reply.toSnapshot()).toEqual({
      id: ID,
      name: 'Primer contacto',
      subject: undefined,
      body: 'Hola',
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('rejects an empty name or body, and a body that is too long', () => {
    expect(unwrapErr(create({ name: ' ' }))).toEqual({ type: 'InvalidQuickReply', reason: 'name' });
    expect(unwrapErr(create({ body: '' }))).toEqual({ type: 'InvalidQuickReply', reason: 'body' });
    expect(unwrapErr(create({ body: 'a'.repeat(MAX_QUICK_REPLY_BODY_LENGTH + 1) }))).toEqual({
      type: 'InvalidQuickReply',
      reason: 'body',
    });
    expect(unwrapErr(create({ subject: 'a'.repeat(151) }))).toEqual({
      type: 'InvalidQuickReply',
      reason: 'subject',
    });
  });

  it('rejects variables that do not exist, in the subject or the body', () => {
    expect(
      unwrapErr(create({ subject: 'Hola [[nombre]]', body: '[[Telefono]] y [[nombre]]' })),
    ).toEqual({
      type: 'InvalidQuickReply',
      reason: 'unknown_variables',
      variables: ['nombre', 'telefono'],
    });
  });

  it('edits only when something changed', () => {
    const reply = unwrap(create());

    expect(
      unwrap(
        reply.edit(
          {
            name: 'Primer contacto',
            subject: 'Hola [[primer_nombre_contacto]]',
            body: 'Soy [[nombre_asesor]], de [[nombre_empresa]].',
          },
          LATER,
        ),
      ),
    ).toBe(false);
    expect(reply.toSnapshot().updatedAt).toEqual(NOW);

    expect(unwrap(reply.edit({ name: 'Otro', subject: undefined, body: 'Hola' }, LATER))).toBe(
      true,
    );
    expect(reply.toSnapshot()).toMatchObject({
      name: 'Otro',
      subject: undefined,
      body: 'Hola',
      updatedAt: LATER,
    });
  });

  it('activates and deactivates', () => {
    const reply = unwrap(create());

    expect(reply.setActive(true, LATER)).toBe(false);
    expect(reply.setActive(false, LATER)).toBe(true);
    expect(reply.toSnapshot()).toMatchObject({ isActive: false, updatedAt: LATER });
  });
});

describe('fillVariables', () => {
  const values = {
    nombre_contacto: 'Ana Pérez',
    primer_nombre_contacto: 'Ana',
    nombre_asesor: 'Camila Pedro',
    nombre_empresa: undefined,
  };

  it('fills the known variables, in any case and with spaces inside the brackets', () => {
    expect(fillVariables('Hola [[primer_nombre_contacto]], soy [[ NOMBRE_ASESOR ]].', values)).toBe(
      'Hola Ana, soy Camila Pedro.',
    );
  });

  it('leaves a variable without a value empty and an unknown one as it was', () => {
    expect(fillVariables('De [[nombre_empresa]] [[otra]]', values)).toBe('De  [[otra]]');
  });
});

describe('unknownVariables', () => {
  it('lists each unknown variable once', () => {
    expect(unknownVariables('[[a]] [[nombre_contacto]] [[A]] [[b]]')).toEqual(['a', 'b']);
  });
});

describe('firstNameOf', () => {
  it('takes the first word of the name', () => {
    expect(firstNameOf(' Ana María Pérez')).toBe('Ana');
    expect(firstNameOf('  ')).toBeUndefined();
    expect(firstNameOf(undefined)).toBeUndefined();
  });
});
