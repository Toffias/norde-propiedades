import { isOpenStatus, OPPORTUNITY_STATUSES } from '../../clients';
import { HomeFilterSchema, type AgentRef, type HomeFilter } from '../contracts';
import type { ReportingUserNames } from './ports/user-names';

export interface InvalidInputError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

export function invalidInput(error: {
  readonly issues: readonly { readonly message: string }[];
}): InvalidInputError {
  return { type: 'InvalidInput', issues: error.issues.map((issue) => issue.message) };
}

/** "Pendientes de contactar": las oportunidades que todavía están en la categoría nuevo. */
export const PENDING_CONTACT_CATEGORIES: readonly string[] = ['new'];

/** Las categorías de una oportunidad abierta (ni ganada ni perdida). */
export const OPEN_CATEGORIES: readonly string[] = OPPORTUNITY_STATUSES.filter(isOpenStatus);

export function parseHomeFilter(input: HomeFilter) {
  return HomeFilterSchema.safeParse(input);
}

/** Cambia el `agentId` de cada fila por el agente con su nombre. */
export async function withAgents<T extends { readonly agentId: string | undefined }>(
  users: ReportingUserNames,
  rows: readonly T[],
): Promise<(Omit<T, 'agentId'> & { readonly agent: AgentRef | undefined })[]> {
  const ids = [...new Set(rows.flatMap((row) => (row.agentId === undefined ? [] : [row.agentId])))];
  const names = ids.length === 0 ? new Map<string, string>() : await users.names(ids);
  return rows.map(({ agentId, ...row }) => ({
    ...row,
    agent: agentId === undefined ? undefined : { id: agentId, name: names.get(agentId) },
  }));
}
