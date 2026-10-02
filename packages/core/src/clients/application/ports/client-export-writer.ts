import type { ClientListRow } from '../../contracts';

/** Un archivo generado de a partes, para no cargar la exportación entera en memoria. */
export interface ClientExportFile {
  readonly filename: string;
  readonly contentType: string;
  readonly body: AsyncIterable<Uint8Array>;
}

/** Arma la planilla de Excel a partir de las filas, que llegan por lotes. */
export interface ClientExportWriter {
  write(
    batches: AsyncIterable<readonly ClientListRow[]>,
    meta: { readonly generatedAt: Date },
  ): ClientExportFile;
}
