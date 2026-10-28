import { createHash, randomBytes } from 'node:crypto';

import type { IssuedSharedListingToken, SharedListingTokens } from '@norde/core/clients';

/**
 * Tokens de los links de envíos: 32 bytes al azar en base64url (43 caracteres). Se guarda solo el
 * SHA-256: con la base no se puede armar un link.
 */
export class RandomSharedListingTokens implements SharedListingTokens {
  issue(): IssuedSharedListingToken {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashOf(token) };
  }

  hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
