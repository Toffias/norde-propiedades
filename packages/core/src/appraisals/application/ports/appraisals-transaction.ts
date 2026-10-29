import type { AuditLog, IdempotencyKeys, EventPublisher, UnitOfWork } from '../../../shared';
import type {
  AppraisalPhotoRepository,
  AppraisalRepository,
} from '../../domain/appraisal.repository';

/** La secuencia de los códigos de tasación (`TAS0001`). Un número usado no se repite. */
export interface AppraisalCodeSequence {
  next(): Promise<number>;
}

/** Lo que un command de appraisals usa dentro de la transacción, ligado a la misma conexión. */
export interface AppraisalsTransaction {
  readonly appraisals: AppraisalRepository;
  readonly photos: AppraisalPhotoRepository;
  readonly codes: AppraisalCodeSequence;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
  /** Claves de idempotencia de las altas (ADR 0050). */
  readonly idempotency: IdempotencyKeys;
}

export type AppraisalsUnitOfWork = UnitOfWork<AppraisalsTransaction>;
