import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Cifra y descifra secretos que se guardan en la base (tokens de portales). */
export interface SecretCipher {
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}

/**
 * AES-256-GCM con una clave de 32 bytes en base64 (`openssl rand -base64 32`). Cada valor guarda
 * `versión | IV | tag | texto cifrado`: el tag detecta cualquier cambio y la versión deja rotar el
 * formato sin perder lo guardado.
 */
export class AesGcmSecretCipher implements SecretCipher {
  readonly #key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(`The secret key must be ${KEY_BYTES} bytes in base64`);
    }
    this.#key = key;
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), encrypted]);
  }

  decrypt(ciphertext: Buffer): string {
    if (ciphertext.length < 1 + IV_BYTES + TAG_BYTES || ciphertext[0] !== VERSION) {
      throw new Error('Unknown secret format');
    }
    const iv = ciphertext.subarray(1, 1 + IV_BYTES);
    const tag = ciphertext.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.#key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }
}
