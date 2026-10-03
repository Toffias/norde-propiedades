import type { Development, DevelopmentId } from './development';

export interface DevelopmentRepository {
  /** También los de la papelera. */
  findById(id: DevelopmentId): Promise<Development | undefined>;
  /** Cuántas unidades activas (fuera de la papelera) tiene. */
  countActiveUnits(id: DevelopmentId): Promise<number>;
  save(development: Development, actorId: string): Promise<void>;
}
