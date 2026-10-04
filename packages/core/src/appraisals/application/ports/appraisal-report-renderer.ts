import type { AppraisalDetail } from '../../contracts';

/** Lo que imprime el informe de la tasación, ya resuelto por el caso de uso. */
export interface AppraisalReportContent {
  readonly appraisal: AppraisalDetail;
  /** Las fotos originales, en orden. Llegan de a una para no tenerlas todas en memoria. */
  readonly photos: AsyncIterable<Uint8Array>;
  readonly company: { readonly name: string; readonly logo: Uint8Array | undefined };
  readonly generatedAt: Date;
}

/** Arma el PDF de la tasación (pdf-lib), en español. */
export interface AppraisalReportRenderer {
  render(content: AppraisalReportContent): Promise<Uint8Array>;
}
