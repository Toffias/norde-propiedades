import { err, ok, type Result } from '../result';

export interface InvalidEmailError {
  readonly type: 'InvalidEmail';
}

// Validación de forma, no de existencia: algo@dominio.tld, sin espacios.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 254;

/** Email normalizado (sin espacios y en minúsculas). Si existe, es válido. */
export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Email, InvalidEmailError> {
    const value = raw.trim().toLowerCase();
    if (value.length > MAX_LENGTH || !EMAIL.test(value)) return err({ type: 'InvalidEmail' });
    return ok(new Email(value));
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
