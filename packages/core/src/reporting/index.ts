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
