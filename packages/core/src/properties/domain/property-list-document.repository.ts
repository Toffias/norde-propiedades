import type { PropertyListDocument, PropertyListDocumentId } from './property-list-document';

export interface PropertyListDocumentRepository {
  findById(id: PropertyListDocumentId): Promise<PropertyListDocument | undefined>;
  save(document: PropertyListDocument, actorId: string): Promise<void>;
}
