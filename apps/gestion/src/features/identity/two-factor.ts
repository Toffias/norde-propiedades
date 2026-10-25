import { UNEXPECTED_ERROR_MESSAGE } from '../../lib/errors';
import type { SignInFailure } from './sign-in';

// Reglas de presentación de la verificación en dos pasos (#113): qué decir cuando un código no
// sirve, en el login y en "Mi cuenta".

export interface TwoFactorSignInError {
  readonly message: string;
  /** El desafío venció o se agotaron los intentos: hay que volver a poner la contraseña. */
  readonly restart: boolean;
}

/** Mensaje de un código rechazado en el segundo paso del login. */
export function twoFactorSignInError(failure: SignInFailure): TwoFactorSignInError {
  switch (failure.code ?? '') {
    case 'INVALID_CODE':
      return {
        message: 'El código no es correcto. Usá el que muestra la app en este momento.',
        restart: false,
      };
    case 'INVALID_BACKUP_CODE':
      return { message: 'Ese código de respaldo no es válido o ya se usó.', restart: false };
    case 'ACCOUNT_TEMPORARILY_LOCKED':
      return {
        message: 'Demasiados códigos incorrectos. Esperá 15 minutos y probá de nuevo.',
        restart: true,
      };
    case 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE':
    case 'INVALID_TWO_FACTOR_COOKIE':
      return {
        message: 'Pasó mucho tiempo o hubo muchos intentos. Ingresá tu contraseña de nuevo.',
        restart: true,
      };
    case 'FAILED_TO_CREATE_SESSION':
      return {
        message: 'Tu usuario no tiene acceso al panel. Hablá con un administrador.',
        restart: true,
      };
    default:
      if (failure.status === 429) {
        return {
          message: 'Demasiados intentos. Esperá un minuto y probá de nuevo.',
          restart: false,
        };
      }
      return { message: UNEXPECTED_ERROR_MESSAGE, restart: false };
  }
}

/** Mensaje de un error al activar, desactivar o regenerar los códigos desde "Mi cuenta". */
export function twoFactorSettingsError(failure: SignInFailure): string {
  if (failure.code === 'INVALID_PASSWORD') return 'La contraseña no es correcta.';
  // Desactivar pide una sesión reciente (menos de un día).
  if (failure.code === 'SESSION_NOT_FRESH') {
    return 'Por seguridad, salí y volvé a ingresar para hacer este cambio.';
  }
  if (failure.code === 'INVALID_CODE') {
    return 'El código no es correcto. Usá el que muestra la app en este momento.';
  }
  if (failure.status === 429) return 'Demasiados intentos. Esperá un minuto y probá de nuevo.';
  return UNEXPECTED_ERROR_MESSAGE;
}

/**
 * La clave para cargar a mano en la app autenticadora, si no se puede escanear el QR: el secreto
 * del URI `otpauth://`, en grupos de cuatro para copiarlo sin errores.
 */
export function manualEntryKey(totpUri: string): string {
  const secret = URL.canParse(totpUri) ? new URL(totpUri).searchParams.get('secret') : null;
  return (secret ?? '').match(/.{1,4}/g)?.join(' ') ?? '';
}
