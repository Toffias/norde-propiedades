import type { ReservationListRow } from '../../contracts';
import type { ExportFile } from './property-export-writer';

/** Arma la planilla de Excel de las reservas a partir de las filas, que llegan por lotes. */
export interface ReservationExportWriter {
  write(
    batches: AsyncIterable<readonly ReservationListRow[]>,
    meta: { readonly generatedAt: Date },
  ): ExportFile;
}
