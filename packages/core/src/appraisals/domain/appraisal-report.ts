import { err, ok, type Result } from '../../shared/domain/result';

import { hasSuggestedValue, type AppraisalResult } from './appraisal-result';
import type { AppraisalStatus } from './appraisal-status';

// El informe de la tasación en PDF, el que se le entrega al propietario con la marca de Norde.

/** El PDF sale de una tasación tasada (o ya convertida en propiedad) que tiene un valor sugerido. */
export interface AppraisalNotReportableError {
  readonly type: 'AppraisalNotReportable';
}

const REPORTABLE_STATUSES: readonly AppraisalStatus[] = ['appraised', 'converted'];

/** ¿Se puede armar el PDF? Sin valor sugerido no hay nada que informar. */
export function checkAppraisalReportable(appraisal: {
  readonly status: AppraisalStatus;
  readonly result: Pick<AppraisalResult, 'sale' | 'rent'>;
}): Result<void, AppraisalNotReportableError> {
  return REPORTABLE_STATUSES.includes(appraisal.status) && hasSuggestedValue(appraisal.result)
    ? ok(undefined)
    : err({ type: 'AppraisalNotReportable' });
}

/** Nombre del archivo que se descarga: `Tasacion-TAS0001.pdf`. */
export function appraisalReportFileName(code: string): string {
  return `Tasacion-${code}.pdf`;
}
