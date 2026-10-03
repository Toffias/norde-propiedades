import type { UnitDesignation } from './development-unit-import';
import type { Property, PropertyId } from './property';

export interface PropertyRepository {
  /** También las de la papelera. */
  findById(id: PropertyId): Promise<Property | undefined>;
  /** Otra propiedad con ese código de referencia, también en la papelera. */
  findByCode(code: string): Promise<Property | undefined>;
  /**
   * Las unidades del emprendimiento con ese piso y unidad (normalizados como
   * `normalizeUnitDesignation`), también las de la papelera. Como mucho `limit`.
   */
  findUnitsByDesignation(
    developmentId: string,
    designation: UnitDesignation,
    limit: number,
  ): Promise<readonly Property[]>;
  save(property: Property, actorId: string): Promise<void>;
}
