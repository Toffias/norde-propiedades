import { describe, expect, it } from 'vitest';

import { UNEXPECTED_ERROR_MESSAGE } from '../../lib/errors';
import { manualEntryKey, twoFactorSettingsError, twoFactorSignInError } from './two-factor';

describe('twoFactorSignInError', () => {
  it('lets the user try another code', () => {
    expect(twoFactorSignInError({ status: 401, code: 'INVALID_CODE' })).toEqual({
      message: 'El código no es correcto. Usá el que muestra la app en este momento.',
      restart: false,
    });
    expect(twoFactorSignInError({ status: 401, code: 'INVALID_BACKUP_CODE' })).toEqual({
      message: 'Ese código de respaldo no es válido o ya se usó.',
      restart: false,
    });
  });

  it('goes back to the password when the challenge is over', () => {
    for (const code of ['TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE', 'INVALID_TWO_FACTOR_COOKIE']) {
      expect(twoFactorSignInError({ status: 401, code })).toEqual({
        message: 'Pasó mucho tiempo o hubo muchos intentos. Ingresá tu contraseña de nuevo.',
        restart: true,
      });
    }
  });

  it('explains the account lock', () => {
    expect(twoFactorSignInError({ status: 429, code: 'ACCOUNT_TEMPORARILY_LOCKED' })).toEqual({
      message: 'Demasiados códigos incorrectos. Esperá 15 minutos y probá de nuevo.',
      restart: true,
    });
  });

  it('explains that a blocked user has no access', () => {
    expect(twoFactorSignInError({ status: 500, code: 'FAILED_TO_CREATE_SESSION' }).message).toBe(
      'Tu usuario no tiene acceso al panel. Hablá con un administrador.',
    );
  });

  it('explains the rate limit and falls back to the generic message', () => {
    expect(twoFactorSignInError({ status: 429 }).message).toBe(
      'Demasiados intentos. Esperá un minuto y probá de nuevo.',
    );
    expect(twoFactorSignInError({ status: 500 }).message).toBe(UNEXPECTED_ERROR_MESSAGE);
  });
});

describe('twoFactorSettingsError', () => {
  it('maps the expected failures', () => {
    expect(twoFactorSettingsError({ status: 400, code: 'INVALID_PASSWORD' })).toBe(
      'La contraseña no es correcta.',
    );
    expect(twoFactorSettingsError({ status: 401, code: 'INVALID_CODE' })).toBe(
      'El código no es correcto. Usá el que muestra la app en este momento.',
    );
    expect(twoFactorSettingsError({ status: 403, code: 'SESSION_NOT_FRESH' })).toBe(
      'Por seguridad, salí y volvé a ingresar para hacer este cambio.',
    );
    expect(twoFactorSettingsError({ status: 429 })).toBe(
      'Demasiados intentos. Esperá un minuto y probá de nuevo.',
    );
    expect(twoFactorSettingsError({ status: 500 })).toBe(UNEXPECTED_ERROR_MESSAGE);
  });
});

describe('manualEntryKey', () => {
  it('groups the secret of the URI in fours', () => {
    expect(manualEntryKey('otpauth://totp/Norde:camila?secret=JBSWY3DPEHPK3PXP&issuer=Norde')).toBe(
      'JBSW Y3DP EHPK 3PXP',
    );
  });

  it('is empty for a malformed URI', () => {
    expect(manualEntryKey('no es un uri')).toBe('');
  });
});
