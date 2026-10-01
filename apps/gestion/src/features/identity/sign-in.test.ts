import { describe, expect, it } from 'vitest';

import { UNEXPECTED_ERROR_MESSAGE } from '../../lib/errors';
import { safeReturnPath, signInErrorMessage } from './sign-in';

describe('safeReturnPath', () => {
  it('goes back to a path of the panel, with its query', () => {
    expect(safeReturnPath('/contactos?page=2')).toBe('/contactos?page=2');
  });

  it('goes to the start page without a destination', () => {
    expect(safeReturnPath(undefined)).toBe('/');
    expect(safeReturnPath([])).toBe('/');
  });

  it('never leaves the panel', () => {
    expect(safeReturnPath('https://evil.example')).toBe('/');
    expect(safeReturnPath('//evil.example')).toBe('/');
    expect(safeReturnPath('/\\evil.example')).toBe('/');
    expect(safeReturnPath('contactos')).toBe('/');
  });

  it('does not loop back to the sign-in page', () => {
    expect(safeReturnPath('/ingresar?motivo=suspendido')).toBe('/');
  });
});

describe('signInErrorMessage', () => {
  it('does not tell a wrong password from an unknown email', () => {
    expect(signInErrorMessage({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      'Email o contraseña incorrectos.',
    );
  });

  it('explains the rate limit', () => {
    expect(signInErrorMessage({ status: 429 })).toBe(
      'Demasiados intentos. Esperá un minuto y probá de nuevo.',
    );
  });

  it('explains that a blocked user has no access', () => {
    expect(signInErrorMessage({ status: 401, code: 'FAILED_TO_CREATE_SESSION' })).toBe(
      'Tu usuario no tiene acceso al panel. Hablá con un administrador.',
    );
  });

  it('falls back to the generic message', () => {
    expect(signInErrorMessage({ status: 500 })).toBe(UNEXPECTED_ERROR_MESSAGE);
  });
});
