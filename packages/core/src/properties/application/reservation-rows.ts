import type { ReservationRow } from '../contracts';
import type { ReservationListItem } from './ports/property-reservations-query';
import type { UserNames } from './ports/user-names';

/** Pone los nombres del agente y del gerente (una sola consulta para toda la página). */
export async function withUserNames(
  users: UserNames,
  items: readonly ReservationListItem[],
): Promise<ReservationRow[]> {
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
