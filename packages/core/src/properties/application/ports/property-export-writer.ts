import type { PanelPropertyRow, PropertyExportFormat } from '../../contracts';

/** Un archivo generado de a partes, para no cargar la exportación entera en memoria. */
export interface ExportFile {
  readonly filename: string;
  readonly contentType: string;
  readonly body: AsyncIterable<Uint8Array>;
}

/** Arma la planilla (CSV, Excel) o el PDF a partir de las filas, que llegan por lotes. */
export interface PropertyExportWriter {
  write(
    format: PropertyExportFormat,
    batches: AsyncIterable<readonly PanelPropertyRow[]>,
    meta: { readonly generatedAt: Date },
  ): ExportFile;
}
