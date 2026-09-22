import type { IdGenerator } from '@norde/core/shared';
import { v7 as uuidv7 } from 'uuid';

/** UUID v7: ordenables por tiempo, buenos para índices de Postgres. */
export class UuidV7IdGenerator implements IdGenerator {
  next(): string {
    return uuidv7();
  }
}
