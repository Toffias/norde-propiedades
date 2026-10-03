import type {
  DevelopmentUnitImport,
  DevelopmentUnitImportId,
  UnitImportRowProblem,
} from './development-unit-import';

export interface DevelopmentUnitImportRepository {
  findById(id: DevelopmentUnitImportId): Promise<DevelopmentUnitImport | undefined>;
  /** `actorId` queda como autor de la fila (`created_by` / `updated_by`). */
  save(job: DevelopmentUnitImport, actorId: string): Promise<void>;
  /** Una fila que no se importó. */
  addProblem(
    importId: DevelopmentUnitImportId,
    problem: UnitImportRowProblem,
    now: Date,
  ): Promise<void>;
}
