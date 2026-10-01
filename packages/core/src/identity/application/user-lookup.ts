import { parseId } from '../../shared';
import type { User } from '../domain/user';
import type { UserRepository } from '../domain/user.repository';

/** Busca un usuario por un ID que llegó de afuera (ya validado como UUID por el contract). */
export async function findUser(users: UserRepository, rawId: string): Promise<User | undefined> {
  const id = parseId<'User'>(rawId);
  return id.isOk() ? users.findById(id.value) : undefined;
}
