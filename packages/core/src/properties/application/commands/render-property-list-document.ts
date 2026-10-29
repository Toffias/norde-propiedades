import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import type { CompanySettings, CompanySettingsReader, FileStorage } from '../../../settings';
import { DocumentIdInputSchema, type DocumentIdInput } from '../../contracts';
import type { PropertyListDocument } from '../../domain/property-list-document';
import { idOf } from '../catalog-support';
import { companyContact } from '../company-contact';
import type { DocumentContacts } from '../ports/document-contacts';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyDetailLookups } from '../ports/property-detail-lookups';
import type { PropertySheet, PropertySheetRenderer, StaticMaps } from '../ports/property-sheets';
import type { UserNames } from '../ports/user-names';
import { loadPropertySheet } from '../property-sheets';
import { invalidInput, type InvalidInputError } from '../property-support';
import type { DocumentRenderOutcome } from './render-property-document';

export type RenderPropertyListDocumentError = ForbiddenError | InvalidInputError;

/**
 * Lo corre el job de `PropertyListDocumentRequested`: arma el PDF de las propiedades elegidas, una
 * por una (sus fotos no se cargan todas juntas), en el formato pedido y según "Ficha y PDF". Las
 * que se borraron después de pedirlo no salen. Lo guarda en el storage y lo marca listo; si falla,
 * queda "fallido" y el error sigue hacia el job.
 */
export class RenderPropertyListDocument {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly lookups: PropertyDetailLookups;
      readonly users: UserNames;
      readonly storage: FileStorage;
      readonly settings: CompanySettingsReader;
      readonly renderer: PropertySheetRenderer;
      readonly maps: StaticMaps;
      readonly contacts: DocumentContacts;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: DocumentIdInput,
    actor: Actor,
  ): Promise<Result<DocumentRenderOutcome, RenderPropertyListDocumentError>> {
    if (!actor.can('properties:render-documents')) return err({ type: 'Forbidden' });
    const parsed = DocumentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = idOf<'PropertyListDocument'>(parsed.data.documentId);
    if (id === undefined) return ok('gone');

    const document = await this.deps.uow.run((tx) => tx.listDocuments.findById(id));
    if (document?.status !== 'pending') return ok('gone');

    try {
      const settings = await this.deps.settings.get();
      let printed = 0;
      const sheets = this.sheets(document, settings, () => {
        printed += 1;
      });
      const bytes = await this.deps.renderer.render({
        layout: document.layout,
        title: 'Propiedades seleccionadas',
        ...(await this.chrome(document, settings)),
        generatedAt: this.deps.clock.now(),
        sheets,
      });
      if (printed === 0) {
        await this.finish(document, actor, {
          failed: 'Ninguna de las propiedades está disponible.',
        });
        return ok('failed');
      }
      const key = `properties/exports/${document.id}`;
      await this.deps.storage.put({ key, contentType: 'application/pdf', bytes });
      await this.finish(document, actor, { storageKey: key });
      return ok('ready');
    } catch (error) {
      await this.finish(document, actor, { failed: 'No se pudo armar el PDF.' });
      throw error;
    }
  }

  /** Logo y contacto de la casa central (si "Ficha y PDF" lo muestra) y el agente si se eligió. */
  private async chrome(document: PropertyListDocument, settings: CompanySettings) {
    const company = settings.toSnapshot();
    const [logo, contact, agent] = await Promise.all([
      company.logoKey === undefined ? undefined : this.deps.storage.get(company.logoKey),
      companyContact(this.deps.contacts, undefined, company.pdfOptions),
      document.includeAgent ? this.deps.contacts.user(document.requestedBy) : undefined,
    ]);
    return { company: { name: company.name, logo: logo?.bytes, contact }, agent };
  }

  private async *sheets(
    document: PropertyListDocument,
    settings: CompanySettings,
    onPrinted: () => void,
  ): AsyncIterable<PropertySheet> {
    for (const propertyId of document.propertyIds) {
      const sheet = await loadPropertySheet(propertyId, document.layout, settings, this.deps);
      if (sheet === undefined) continue;
      onPrinted();
      yield sheet;
    }
  }

  private finish(
    document: PropertyListDocument,
    actor: Actor,
    outcome: { readonly storageKey: string } | { readonly failed: string },
  ): Promise<void> {
    return this.deps.uow.run(async (tx) => {
      const current = await tx.listDocuments.findById(document.id);
      if (!current) return;
      const now = this.deps.clock.now();
      if ('storageKey' in outcome) current.complete(outcome.storageKey, now);
      else current.fail(outcome.failed, now);
      await tx.listDocuments.save(current, actor.id);
    });
  }
}
