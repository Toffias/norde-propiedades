import type { Email } from '../../shared/domain/value-objects/email';

import type { User, UserId } from './user';

export interface UserRepository {
  findById(id: UserId): Promise<User | undefined>;
  findByEmail(email: Email): Promise<User | undefined>;
  /** `actorId` queda como autor del alta o de la edición (`created_by` / `updated_by`). */
  save(user: User, actorId: string): Promise<void>;
}
