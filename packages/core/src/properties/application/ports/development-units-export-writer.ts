import type { PanelPropertyRow } from '../../contracts';

import type { ExportFile } from './property-export-writer';

/**
 * Arma el Excel de unidades de un emprendimiento a partir de las filas, que llegan por lotes. Las
 * columnas son las que reconoce la importación: el archivo se edita y se vuelve a subir.
 */
export interface DevelopmentUnitsExportWriter {
  write(
    batches: AsyncIterable<readonly PanelPropertyRow[]>,
    meta: { readonly developmentCode: string; readonly generatedAt: Date },
  ): ExportFile;
}
