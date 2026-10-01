// Contracts del módulo reporting (`@norde/core/reporting/contracts`): importables desde el cliente.

import { z } from 'zod';

export const MIN_STATISTICS_MONTHS = 3;
export const MAX_STATISTICS_MONTHS = 24;
/** El reporte al propietario cubre como mucho un año. */
export const MAX_OWNER_REPORT_DAYS = 366;

export const PropertyStatisticsQuerySchema = z.object({
  propertyId: z.uuid(),
  months: z.coerce.number().int().min(MIN_STATISTICS_MONTHS).max(MAX_STATISTICS_MONTHS).default(12),
});
export type PropertyStatisticsInput = z.input<typeof PropertyStatisticsQuerySchema>;

/** Un mes del gráfico (`AAAA-MM`, en hora de Buenos Aires). */
export interface PropertyMonthlyActivity {
  readonly month: string;
  readonly emailSends: number;
  readonly whatsappSends: number;
  readonly inquiries: number;
}

export interface PortalPublicationStats {
  readonly portal: string;
  /** `pending` / `published` / `paused` / `error` / `unpublished`. */
  readonly status: string;
  readonly publishedAt: Date | undefined;
  readonly views: number;
  readonly contacts: number;
  readonly favorites: number;
}

export interface PropertyStatistics {
  readonly totals: {
    readonly emailSends: number;
    readonly whatsappSends: number;
    readonly interested: number;
    readonly inquiries: number;
    readonly activePublications: number;
  };
  readonly monthly: readonly PropertyMonthlyActivity[];
  /** Etiquetas más frecuentes entre los clientes interesados. */
  readonly interestedProfile: readonly {
    readonly tagId: string;
    readonly name: string;
    readonly clients: number;
  }[];
  readonly publications: readonly PortalPublicationStats[];
}

export const OwnerReportQuerySchema = z
  .object({
    propertyId: z.uuid(),
    /** `AAAA-MM-DD`, inclusive. */
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((input) => input.from <= input.to, {
    message: 'La fecha de inicio tiene que ser anterior a la de fin.',
    path: ['to'],
  });
export type OwnerReportInput = z.input<typeof OwnerReportQuerySchema>;

/** Lo que se le informa al propietario de un período: dónde está publicada y qué movimiento tuvo. */
export interface OwnerReport {
  readonly from: string;
  readonly to: string;
  readonly publications: readonly PortalPublicationStats[];
  readonly emailSends: number;
  readonly whatsappSends: number;
  readonly inquiries: number;
  readonly interested: number;
}
