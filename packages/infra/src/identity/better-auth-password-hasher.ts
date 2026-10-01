import type { PasswordHasher } from '@norde/core/identity';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

/** El mismo hash (scrypt) que verifica Better Auth al ingresar. */
export class BetterAuthPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return verifyPassword({ hash, password });
  }
}
