import { accessScope, OWNERSHIP_RULES } from '../../../identity';
import { err, ok, type Actor, type Result } from '../../../shared';
import type { CountByChannel, HomeFilter, PortfolioSummary } from '../../contracts';
import { homeScope } from '../home-scope';
import {
  invalidInput,
  OPEN_CATEGORIES,
  parseHomeFilter,
  type InvalidInputError,
} from '../home-support';
import type { ChannelCount, HomeDashboardQuery } from '../ports/home-dashboard-query';

export type GetPortfolioSummaryError = InvalidInputError;

/**
 * Inicio, "Estado actual": clientes con oportunidad abierta, oportunidades abiertas por canal de
 * origen y por estado, propiedades por estado y emprendimientos en comercialización. Cada parte
 * sale solo con el permiso de su módulo.
 */
export class GetPortfolioSummary {
  constructor(private readonly deps: { readonly home: HomeDashboardQuery }) {}

  async execute(
    input: HomeFilter,
    actor: Actor,
  ): Promise<Result<PortfolioSummary, GetPortfolioSummaryError>> {
    const parsed = parseHomeFilter(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const scope = homeScope(actor, parsed.data);
    const { home } = this.deps;
    const opportunities = accessScope(actor, OWNERSHIP_RULES.opportunitiesRead) !== undefined;
    const properties = actor.can('properties:read');
    const developments = actor.can('developments:read');

    const [clients, byChannel, byStage, byStatus, developmentCount] = await Promise.all([
      opportunities ? home.clientsWithOpportunitiesIn(scope, OPEN_CATEGORIES) : undefined,
      opportunities ? home.opportunitiesByChannel(scope, OPEN_CATEGORIES) : undefined,
      opportunities ? home.opportunitiesByStage(scope, OPEN_CATEGORIES) : undefined,
      properties ? home.propertiesByStatus(scope) : undefined,
      developments ? home.availableDevelopmentsCount(scope) : undefined,
    ]);
    return ok({
      clientsWithOpenOpportunity: clients,
      openOpportunitiesByChannel: byChannel && withShares(byChannel),
      openOpportunitiesByStage: byStage,
      propertiesByStatus: byStatus,
      availableDevelopments: developmentCount,
    });
  }
}

/** El porcentaje de cada canal sobre el total, con un decimal. */
function withShares(rows: readonly ChannelCount[]): readonly CountByChannel[] {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({
    ...row,
    share: total === 0 ? 0 : Math.round((row.count / total) * 1000) / 10,
  }));
}
