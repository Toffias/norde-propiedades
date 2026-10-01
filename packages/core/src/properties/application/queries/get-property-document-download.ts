import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  DocumentIdInputSchema,
  type DocumentIdInput,
  type StoredFileDelivery,
} from '../../contracts';
import type { DocumentNotReadyError, PropertyDocumentKind } from '../../domain/property-document';
import { idOf } from '../catalog-support';
import type { DocumentNotFoundError } from '../commands/send-owner-report';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { findProperty, invalidInput, type InvalidInputError } from '../property-support';

export type GetPropertyDocumentDownloadError =
  ForbiddenError | InvalidInputError | DocumentNotFoundError | DocumentNotReadyError;

const SIGNED_URL_SECONDS = 60;

const FILE_PREFIX: Readonly<Record<PropertyDocumentKind, string>> = {
  sheet: 'ficha',
  showcase: 'vidriera',
  owner_report: 'reporte',
};

/** Descarga un PDF listo: URL firmada (S3/R2) o el contenido (disco local). */
export class GetPropertyDocumentDownload {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly storage: FileStorage },
  ) {}

  async execute(
    input: DocumentIdInput,
    actor: Actor,
  ): Promise<Result<StoredFileDelivery, GetPropertyDocumentDownloadError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = DocumentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = idOf<'PropertyDocument'>(parsed.data.documentId);
    const loaded =
      id === undefined
        ? undefined
        : await this.deps.uow.run(async (tx) => {
            const document = await tx.documents.findById(id);
            const property = document
              ? await findProperty(tx.properties, document.propertyId)
              : undefined;
            return document && property ? { document, code: property.code } : undefined;
          });
    if (!loaded) return err({ type: 'DocumentNotFound' });
    const file = loaded.document.readyFile();
    if (file.isErr()) return err(file.error);

    const fileName = `${FILE_PREFIX[loaded.document.kind]}-${loaded.code.toLowerCase()}.pdf`;
    const url = await this.deps.storage.signedUrl(file.value, {
      expiresInSeconds: SIGNED_URL_SECONDS,
      downloadName: fileName,
    });
    if (url !== undefined) return ok({ kind: 'redirect', url });
    const stored = await this.deps.storage.get(file.value);
    if (!stored) return err({ type: 'DocumentNotReady' });
    return ok({ kind: 'content', fileName, contentType: 'application/pdf', bytes: stored.bytes });
  }
}
