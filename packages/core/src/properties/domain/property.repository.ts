import type { Property, PropertyId } from './property';

export interface PropertyRepository {
  /** También las de la papelera. */
  findById(id: PropertyId): Promise<Property | undefined>;
  save(property: Property, actorId: string): Promise<void>;
}
