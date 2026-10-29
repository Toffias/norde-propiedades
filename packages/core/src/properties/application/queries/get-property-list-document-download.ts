import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  DocumentIdInputSchema,
  type DocumentIdInput,
  type StoredFileDelivery,
} from '../../contracts';
import type { DocumentNotReadyError } from '../../domain/property-document';
import { idOf } from '../catalog-support';
import type { DocumentNotFoundError } from '../commands/send-owner-report';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type GetPropertyListDocumentDownloadError =
  ForbiddenError | InvalidInputError | DocumentNotFoundError | DocumentNotReadyError;

const SIGNED_URL_SECONDS = 60;

/** `AAAA-MM-DD` del día del pedido en Buenos Aires, para el nombre del archivo. */
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
});

/**
 * Descarga el PDF de una selección del buscador ya armado: URL firmada (S3/R2) o el contenido
 * (disco local). Lo baja quien lo pidió, o quien puede exportar en cantidad (la barra de todos).
 */
export class GetPropertyListDocumentDownload {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly storage: FileStorage },
  ) {}

  async execute(
    input: DocumentIdInput,
    actor: Actor,
  ): Promise<Result<StoredFileDelivery, GetPropertyListDocumentDownloadError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = DocumentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = idOf<'PropertyListDocument'>(parsed.data.documentId);
    const document =
      id === undefined ? undefined : await this.deps.uow.run((tx) => tx.listDocuments.findById(id));
    if (!document) return err({ type: 'DocumentNotFound' });
    if (document.requestedBy !== actor.id && !actor.can('properties:export-bulk')) {
      return err({ type: 'Forbidden' });
    }
    const file = document.readyFile();
    if (file.isErr()) return err(file.error);

    const fileName = `propiedades-${dayFormat.format(document.createdAt)}.pdf`;
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
