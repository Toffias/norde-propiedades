// API pública del módulo reporting (`@norde/core/reporting`): estadísticas y reportes de lectura.

export * from './contracts';
export type {
  PropertyStatisticsQuery,
  StatisticsRange,
} from './application/ports/property-statistics-query';
export type { ReportingPropertyProfiles } from './application/ports/property-profiles';
export {
  GetPropertyStatistics,
  type GetPropertyStatisticsError,
} from './application/queries/get-property-statistics';
export { GetOwnerReport, type GetOwnerReportError } from './application/queries/get-owner-report';
export type { HomeScope, HomeVisibility } from './application/home-scope';
export type {
  AvailableDevelopmentRecord,
  AvailablePropertyRecord,
  ChannelCount,
  HomeDashboardQuery,
  HomeListRequest,
  PendingOpportunityRecord,
  UpcomingSigningRecord,
} from './application/ports/home-dashboard-query';
export type { ReportingUserNames } from './application/ports/user-names';
export {
  GetUnassignedInquiries,
  type GetUnassignedInquiriesError,
} from './application/queries/get-unassigned-inquiries';
export {
  GetPendingOpportunities,
  type GetPendingOpportunitiesError,
} from './application/queries/get-pending-opportunities';
export {
  GetUpcomingSignings,
  type GetUpcomingSigningsError,
} from './application/queries/get-upcoming-signings';
export {
  GetPortfolioSummary,
  type GetPortfolioSummaryError,
} from './application/queries/get-portfolio-summary';
export {
  ListAvailableProperties,
  type ListAvailablePropertiesError,
} from './application/queries/list-available-properties';
export {
  ListAvailableDevelopments,
  type ListAvailableDevelopmentsError,
} from './application/queries/list-available-developments';
export {
  GlobalSearch,
  type GlobalSearchError,
  type GlobalSearchSources,
} from './application/queries/global-search';
