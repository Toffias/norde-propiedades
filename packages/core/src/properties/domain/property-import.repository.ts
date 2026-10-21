import type { PropertyImport, PropertyImportId, PropertyImportRowProblem } from './property-import';

/** Las importaciones de propiedades de Tokko y las filas con problemas. */
export interface PropertyImportRepository {
  findById(id: PropertyImportId): Promise<PropertyImport | undefined>;
  /** `actorId` queda como autor de la fila. */
  save(job: PropertyImport, actorId: string): Promise<void>;
  /** Si hay una importación desde la API pendiente o en proceso. */
  hasActiveApiImport(): Promise<boolean>;
  addProblem(
    importId: PropertyImportId,
    problem: PropertyImportRowProblem,
    now: Date,
  ): Promise<void>;
}
