import type { PanelUserRef } from '../contracts';
import type { UserNames } from './ports/user-names';

interface WithUserIds {
  readonly agentUserId: string | undefined;
  readonly managerUserId: string | undefined;
}

type WithUsers<T> = Omit<T, 'agentUserId' | 'managerUserId'> & {
  readonly agent: PanelUserRef | undefined;
  readonly manager: PanelUserRef | undefined;
};

/** Pone los nombres del agente y del gerente (una sola consulta para toda la página). */
export async function withUserNames<T extends WithUserIds>(
  users: UserNames,
  items: readonly T[],
): Promise<WithUsers<T>[]> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.agentUserId !== undefined) ids.add(item.agentUserId);
    if (item.managerUserId !== undefined) ids.add(item.managerUserId);
  }
  const names = ids.size === 0 ? new Map<string, string>() : await users.names([...ids]);
  const ref = (id: string | undefined) =>
    id === undefined ? undefined : { id, name: names.get(id) };
  return items.map(({ agentUserId, managerUserId, ...item }) => ({
    ...item,
    agent: ref(agentUserId),
    manager: ref(managerUserId),
  }));
}
