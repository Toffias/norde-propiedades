import { MIN_PASSWORD_LENGTH } from '@norde/core/identity/contracts';

// Contraseña temporal sugerida para el alta o el blanqueo: el administrador la copia y se la pasa
// al usuario, que la cambia en su primer ingreso. Sin caracteres que se confunden al dictarla.

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = Math.max(MIN_PASSWORD_LENGTH, 12);

export function generateTemporaryPassword(
  random: (values: Uint32Array) => Uint32Array = (values) => crypto.getRandomValues(values),
): string {
  const values = random(new Uint32Array(LENGTH));
  return Array.from(values, (value) => ALPHABET[value % ALPHABET.length] ?? '').join('');
}
