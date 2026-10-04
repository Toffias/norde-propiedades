import type { AppraisalRef } from '../contracts';
import type { PanelDirectory } from './ports/panel-directory';

// Pone los nombres de usuarios, sucursales y del solicitante en las filas leídas de la base.

interface WithIds {
  readonly requesterClientId: string;
  readonly requesterName: string | undefined;
  readonly producerUserId: string;
  readonly appraiserUserId: string | undefined;
  readonly branchId: string | undefined;
}

type WithRefs<T> = Omit<T, keyof WithIds> & {
  readonly requester: { readonly id: string; readonly name: string | undefined };
  readonly producer: AppraisalRef;
  readonly appraiser: AppraisalRef | undefined;
  readonly branch: AppraisalRef | undefined;
};

/** Una consulta para los usuarios y otra para las sucursales de toda la página. */
export async function withNames<T extends WithIds>(
  directory: PanelDirectory,
  items: readonly T[],
): Promise<WithRefs<T>[]> {
  const userIds = new Set<string>();
  const branchIds = new Set<string>();
  for (const item of items) {
    userIds.add(item.producerUserId);
    if (item.appraiserUserId !== undefined) userIds.add(item.appraiserUserId);
    if (item.branchId !== undefined) branchIds.add(item.branchId);
  }
  const [users, branches] = await Promise.all([
    userIds.size === 0 ? new Map<string, string>() : directory.names('user', [...userIds]),
    branchIds.size === 0 ? new Map<string, string>() : directory.names('branch', [...branchIds]),
  ]);
  const ref = (names: ReadonlyMap<string, string>, id: string | undefined) =>
    id === undefined ? undefined : { id, name: names.get(id) };
  return items.map(
    ({ requesterClientId, requesterName, producerUserId, appraiserUserId, branchId, ...item }) => ({
      ...item,
      requester: { id: requesterClientId, name: requesterName },
      producer: { id: producerUserId, name: users.get(producerUserId) },
      appraiser: ref(users, appraiserUserId),
      branch: ref(branches, branchId),
    }),
  );
}
