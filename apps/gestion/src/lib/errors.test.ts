import { describe, expect, it } from 'vitest';

import { UNEXPECTED_ERROR_MESSAGE, messageForError, type ErrorMessages } from './errors';

type ArchiveError =
  | { readonly type: 'Forbidden' }
  | { readonly type: 'ContactNotFound' }
  | { readonly type: 'HasActiveContract'; readonly contractCode: string };

const ARCHIVE_MESSAGES = {
  Forbidden: 'No podés archivar contactos de otros agentes.',
  ContactNotFound: 'El contacto ya no existe.',
  HasActiveContract: (error) => `Tiene el contrato ${error.contractCode} vigente.`,
} satisfies ErrorMessages<ArchiveError>;

describe('messageForError', () => {
  it('uses the message of the feature first', () => {
    expect(messageForError<ArchiveError>({ type: 'Forbidden' }, ARCHIVE_MESSAGES)).toBe(
      'No podés archivar contactos de otros agentes.',
    );
  });

  it('builds the message from the error data', () => {
    expect(
      messageForError<ArchiveError>(
        { type: 'HasActiveContract', contractCode: 'ALQ-12' },
        ARCHIVE_MESSAGES,
      ),
    ).toBe('Tiene el contrato ALQ-12 vigente.');
  });

  it('falls back to the common messages', () => {
    expect(messageForError({ type: 'Forbidden' })).toBe('No tenés permiso para hacer esto.');
    expect(messageForError({ type: 'InvalidSearch', issues: [] })).toBe(
      'Los filtros no son válidos. Revisalos y probá de nuevo.',
    );
  });

  it('uses a generic message for an unknown type', () => {
    expect(messageForError({ type: 'SomethingNew' })).toBe(UNEXPECTED_ERROR_MESSAGE);
  });
});
