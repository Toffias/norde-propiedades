import type { AppraisalDetail } from '../../contracts';
import type { AppraisalReportFigures } from '../../domain/appraisal-report';

import type { ReportContact } from './report-contacts';

/** Lo que imprime el informe de la tasación, ya resuelto por el caso de uso. */
export interface AppraisalReportContent {
  readonly appraisal: AppraisalDetail;
  /** Valor por m² y promedio de los comparables (los calcula el dominio). */
  readonly figures: AppraisalReportFigures;
  /** Las fotos originales, en orden. Llegan de a una para no tenerlas todas en memoria. */
  readonly photos: AsyncIterable<Uint8Array>;
  readonly company: {
    readonly name: string;
    readonly logo: Uint8Array | undefined;
    /** El color de marca de Mi empresa (`#rrggbb`): títulos, badges e íconos. */
    readonly brandColor: string;
  };
  /** El tasador, con su teléfono y email, si está asignado y activo. */
  readonly appraiser: ReportContact | undefined;
  /** La sucursal de la tasación (o la casa central): el contacto del pie. */
  readonly branch: ReportContact | undefined;
  readonly generatedAt: Date;
}

/** Arma el PDF de la tasación (pdf-lib), en español. */
export interface AppraisalReportRenderer {
  render(content: AppraisalReportContent): Promise<Uint8Array>;
}
