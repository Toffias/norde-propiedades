import type { AppraisalExportRow } from '../../contracts';

/** Un archivo generado de a partes, para no cargar la exportación entera en memoria. */
export interface AppraisalExportFile {
  readonly filename: string;
  readonly contentType: string;
  readonly body: AsyncIterable<Uint8Array>;
}

/** Arma el Excel de tasaciones a partir de las filas, que llegan por lotes. */
export interface AppraisalExportWriter {
  write(
    batches: AsyncIterable<readonly AppraisalExportRow[]>,
    meta: { readonly generatedAt: Date },
  ): AppraisalExportFile;
}
