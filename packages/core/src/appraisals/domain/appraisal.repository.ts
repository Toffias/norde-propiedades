import type { Appraisal, AppraisalId } from './appraisal';

export interface AppraisalRepository {
  /** También las que están en la papelera. */
  findById(id: AppraisalId): Promise<Appraisal | undefined>;
  /** Da de alta una tasación nueva. `actorId` queda en `created_by` y `updated_by`. */
  insert(appraisal: Appraisal, actorId: string): Promise<void>;
  /** Guarda los cambios de una tasación existente. `actorId` queda en `updated_by`. */
  save(appraisal: Appraisal, actorId: string): Promise<void>;
  /**
   * Pasa las tasaciones pedidas por `fromClientId` a `toClientId` (unificación de contactos).
   * Devuelve los IDs de las que cambió.
   */
  moveRequester(fromClientId: string, toClientId: string): Promise<readonly AppraisalId[]>;
  /** Borra físicamente las tasaciones de esos clientes (supresión de sus datos). Devuelve cuántas. */
  deleteByRequesters(clientIds: readonly string[]): Promise<number>;
}
