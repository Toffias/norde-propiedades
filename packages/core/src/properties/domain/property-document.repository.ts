import type { PropertyDocument, PropertyDocumentId } from './property-document';

export interface PropertyDocumentRepository {
  findById(id: PropertyDocumentId): Promise<PropertyDocument | undefined>;
  save(document: PropertyDocument, actorId: string): Promise<void>;
}
