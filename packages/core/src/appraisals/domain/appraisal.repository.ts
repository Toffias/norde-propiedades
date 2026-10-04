import type { Appraisal, AppraisalId } from './appraisal';
import type { AppraisalPhoto, AppraisalPhotoId } from './appraisal-photo';

/** Lo que borró una tanda de la supresión: cuántas tasaciones y las fotos a sacar del storage. */
export interface ErasedAppraisals {
  readonly deleted: number;
  readonly photoKeys: readonly string[];
}

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
  /**
   * Borra físicamente hasta `limit` tasaciones de esos clientes, con sus fotos (supresión de sus
   * datos). Devuelve cuántas borró y las claves de storage de las fotos.
   */
  deleteByRequesters(clientIds: readonly string[], limit: number): Promise<ErasedAppraisals>;
}

/** Fotos de una tasación: como mucho `MAX_APPRAISAL_PHOTOS` por tasación. */
export interface AppraisalPhotoRepository {
  /** En orden de carga. */
  listByAppraisal(appraisalId: AppraisalId): Promise<readonly AppraisalPhoto[]>;
  findById(id: AppraisalPhotoId): Promise<AppraisalPhoto | undefined>;
  count(appraisalId: AppraisalId): Promise<number>;
  nextPosition(appraisalId: AppraisalId): Promise<number>;
  /** `actorId` queda en `created_by` y `updated_by`. */
  insert(photo: AppraisalPhoto, actorId: string): Promise<void>;
  delete(id: AppraisalPhotoId): Promise<void>;
}
