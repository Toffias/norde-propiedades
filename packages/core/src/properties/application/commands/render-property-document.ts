import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import type { CompanySettingsReader, FileStorage } from '../../../settings';
import { DocumentIdInputSchema, type DocumentIdInput } from '../../contracts';
import type { MediaItem } from '../../domain/media-item';
import { pdfAddress, pdfPrices, type PropertyDocument } from '../../domain/property-document';
import { showcasePhotos } from '../../domain/showcase-options';
import { idOf } from '../catalog-support';
import type { DocumentContacts } from '../ports/document-contacts';
import type { OwnerReportRenderer, OwnerReports } from '../ports/property-documents';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyDetailLookups } from '../ports/property-detail-lookups';
import type { ShowcaseRenderer } from '../ports/property-showcase';
import type { PropertySheetRenderer, StaticMaps } from '../ports/property-sheets';
import type { UserNames } from '../ports/user-names';
import { loadPropertySheet, printableKey, sheetsOf } from '../property-sheets';
import { findProperty, invalidInput, type InvalidInputError } from '../property-support';
import { buildPanelPropertyDetail } from '../queries/get-panel-property-detail';

export type RenderPropertyDocumentError = ForbiddenError | InvalidInputError;

/** Qué pasó: ya no existe (o ya se armó), quedó listo o falló. */
export type DocumentRenderOutcome = 'gone' | 'ready' | 'failed';

/** La foto de la tarjeta del reporte; la ficha y la vidriera eligen las suyas. */
const OWNER_REPORT_PHOTOS = 1;

/**
 * Lo corre el job de `PropertyDocumentRequested`: arma el PDF según la configuración de "Ficha y
 * PDF" (dirección, precio, contacto), con las fotos marcadas "incluir en PDF", el agente si se
 * eligió al pedirlo y el link a la ficha en la web si está publicada. La ficha sale en el formato
 * pedido y la vidriera con sus opciones (#175). Lo guarda en el storage y lo marca listo. Si falla, queda "fallido" y el error
 * sigue hacia el job, que lo registra.
 */
export class RenderPropertyDocument {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly lookups: PropertyDetailLookups;
      readonly users: UserNames;
      readonly storage: FileStorage;
      readonly settings: CompanySettingsReader;
      readonly ownerReportRenderer: OwnerReportRenderer;
      readonly sheets: PropertySheetRenderer;
      readonly showcases: ShowcaseRenderer;
      readonly maps: StaticMaps;
      readonly ownerReports: OwnerReports;
      readonly contacts: DocumentContacts;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: DocumentIdInput,
    actor: Actor,
  ): Promise<Result<DocumentRenderOutcome, RenderPropertyDocumentError>> {
    if (!actor.can('properties:render-documents')) return err({ type: 'Forbidden' });
    const parsed = DocumentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = idOf<'PropertyDocument'>(parsed.data.documentId);
    if (id === undefined) return ok('gone');

    const loaded = await this.deps.uow.run(async (tx) => {
      const document = await tx.documents.findById(id);
      if (document?.status !== 'pending') return undefined;
      if (document.kind === 'sheet') {
        return { document, property: undefined, gallery: [], developmentGallery: [] };
      }
      const property = await findProperty(tx.properties, document.propertyId);
      if (!property) return undefined;
      const gallery = await tx.media.listForOwner({ kind: 'property', id: property.id });
      // Una unidad puede sumar las fotos de su emprendimiento: se leen, no se copian.
      const developmentId =
        property.developmentId === undefined
          ? undefined
          : idOf<'Development'>(property.developmentId);
      const developmentGallery =
        developmentId === undefined
          ? []
          : await tx.media.listForOwner({ kind: 'development', id: developmentId });
      return { document, property, gallery, developmentGallery };
    });
    if (!loaded) return ok('gone');
    const { document, property, gallery, developmentGallery } = loaded;

    try {
      const bytes =
        property === undefined
          ? await this.renderSheet(document)
          : document.kind === 'showcase'
            ? await this.renderShowcase(document, property, gallery, developmentGallery)
            : await this.renderOwnerReport(document, property, gallery, developmentGallery, actor);
      if (bytes === undefined) {
        await this.finish(document.id, actor, {
          failed:
            document.kind === 'owner_report'
              ? 'No se pudo armar el reporte del período.'
              : 'La propiedad ya no está disponible.',
        });
        return ok('failed');
      }
      const key = `properties/${document.propertyId}/documents/${document.id}`;
      await this.deps.storage.put({ key, contentType: 'application/pdf', bytes });
      await this.finish(document.id, actor, { storageKey: key });
      return ok('ready');
    } catch (error) {
      await this.finish(document.id, actor, { failed: 'No se pudo armar el PDF.' });
      throw error;
    }
  }

  /** La ficha en el formato pedido. `undefined` si la propiedad ya no existe. */
  private async renderSheet(document: PropertyDocument): Promise<Uint8Array | undefined> {
    const settings = await this.deps.settings.get();
    const sheet = await loadPropertySheet(document.propertyId, document.layout, settings, {
      ...this.deps,
    });
    if (sheet === undefined) return undefined;
    const company = settings.toSnapshot();
    const [logo, contact, agent] = await Promise.all([
      company.logoKey === undefined ? undefined : this.deps.storage.get(company.logoKey),
      company.pdfOptions.showCompanyContact
        ? this.deps.contacts.branch(sheet.property.branchId)
        : undefined,
      document.includeAgent ? this.deps.contacts.user(document.requestedBy) : undefined,
    ]);
    return this.deps.sheets.render({
      layout: document.layout,
      title: `Ficha ${sheet.property.code}`,
      company: { name: company.name, logo: logo?.bytes, contact },
      agent,
      generatedAt: this.deps.clock.now(),
      sheets: sheetsOf([sheet]),
    });
  }

  /**
   * Las fotos "incluir en PDF": primero las de la unidad y después, si Mi empresa lo pide, las del
   * emprendimiento.
   */
  private printablePhotos(
    gallery: readonly MediaItem[],
    developmentGallery: readonly MediaItem[],
    developmentPhotosInUnits: boolean,
  ): MediaItem[] {
    return (developmentPhotosInUnits ? [...gallery, ...developmentGallery] : gallery).filter(
      (item) => item.kind === 'photo' && item.toSnapshot().includeInPdf,
    );
  }

  private async photoBytes(items: readonly MediaItem[]): Promise<Uint8Array[]> {
    const keys = items.flatMap((item) => {
      const key = printableKey(item);
      return key === undefined ? [] : [key];
    });
    return (await Promise.all(keys.map((key) => this.deps.storage.get(key))))
      .filter((stored) => stored !== undefined)
      .map((stored) => stored.bytes);
  }

  /**
   * La vidriera con las opciones elegidas: las fotos elegidas (completadas con las de la ficha), el
   * QR si se pidió y la propiedad está en la web, y el contacto según "Ficha y PDF".
   */
  private async renderShowcase(
    document: PropertyDocument,
    property: Parameters<typeof buildPanelPropertyDetail>[0],
    gallery: readonly MediaItem[],
    developmentGallery: readonly MediaItem[],
  ): Promise<Uint8Array> {
    const detail = await buildPanelPropertyDetail(property, this.deps);
    const settings = (await this.deps.settings.get()).toSnapshot();
    const pdf = settings.pdfOptions;
    const options = document.showcase;
    const chosen = showcasePhotos(
      this.printablePhotos(gallery, developmentGallery, pdf.developmentPhotosInUnits),
      options,
    );
    const [photos, logo, contact, agent] = await Promise.all([
      this.photoBytes(chosen),
      settings.logoKey === undefined ? undefined : this.deps.storage.get(settings.logoKey),
      pdf.showCompanyContact ? this.deps.contacts.branch(detail.branchId) : undefined,
      document.includeAgent ? this.deps.contacts.user(document.requestedBy) : undefined,
    ]);
    // La ficha en la web solo si la web la muestra: si no, el QR no abre.
    const qrUrl =
      options.qr && detail.isPubliclyListed && settings.webPropertyUrlTemplate !== undefined
        ? settings.webPropertyUrlTemplate.render({ id: detail.id, slug: detail.slug })
        : undefined;
    return this.deps.showcases.render({
      property: detail,
      address: pdfAddress(detail, pdf.addressOnDownload),
      prices: pdfPrices(detail.operations, {
        showPrice: pdf.showPrice,
        showPriceOnWeb: detail.publication.showPriceOnWeb,
      }),
      photos,
      company: { name: settings.name, logo: logo?.bytes },
      contact,
      agent,
      qrUrl,
      options,
      generatedAt: this.deps.clock.now(),
    });
  }

  /**
   * El reporte al propietario del período, con la foto de la ficha, "Tu productor" (el productor de
   * la propiedad o quien lo pidió) si van los datos del agente, y el contacto de la sucursal si
   * "Ficha y PDF" lo muestra. `undefined` si no hay reporte para el período.
   */
  private async renderOwnerReport(
    document: PropertyDocument,
    property: Parameters<typeof buildPanelPropertyDetail>[0],
    gallery: readonly MediaItem[],
    developmentGallery: readonly MediaItem[],
    actor: Actor,
  ): Promise<Uint8Array | undefined> {
    const period = document.period;
    if (period === undefined) return undefined;
    const detail = await buildPanelPropertyDetail(property, this.deps);
    const report = await this.deps.ownerReports.build(
      property.id,
      { ...period, listedAt: detail.createdAt },
      actor,
    );
    if (report === undefined) return undefined;
    const settings = (await this.deps.settings.get()).toSnapshot();
    const pdf = settings.pdfOptions;
    const [photos, logo, contact, producer] = await Promise.all([
      this.photoBytes(
        this.printablePhotos(gallery, developmentGallery, pdf.developmentPhotosInUnits).slice(
          0,
          OWNER_REPORT_PHOTOS,
        ),
      ),
      settings.logoKey === undefined ? undefined : this.deps.storage.get(settings.logoKey),
      pdf.showCompanyContact ? this.deps.contacts.branch(detail.branchId) : undefined,
      document.includeAgent
        ? this.deps.contacts.user(detail.producer?.id ?? document.requestedBy)
        : undefined,
    ]);
    // La ficha en la web solo si la web la muestra: si no, el link no abre.
    const webUrl =
      detail.isPubliclyListed && settings.webPropertyUrlTemplate !== undefined
        ? settings.webPropertyUrlTemplate.render({ id: detail.id, slug: detail.slug })
        : undefined;
    return this.deps.ownerReportRenderer.render({
      property: detail,
      address: pdfAddress(detail, pdf.addressOnDownload),
      prices: pdfPrices(detail.operations, {
        showPrice: pdf.showPrice,
        showPriceOnWeb: detail.publication.showPriceOnWeb,
      }),
      photo: photos[0],
      company: { name: settings.name, logo: logo?.bytes },
      contact,
      producer,
      webUrl,
      report,
      options: document.ownerReportOptions,
      generatedAt: this.deps.clock.now(),
    });
  }

  private finish(
    id: PropertyDocument['id'],
    actor: Actor,
    outcome: { readonly storageKey: string } | { readonly failed: string },
  ): Promise<void> {
    return this.deps.uow.run(async (tx) => {
      const document = await tx.documents.findById(id);
      if (!document) return;
      const now = this.deps.clock.now();
      if ('storageKey' in outcome) document.complete(outcome.storageKey, now);
      else document.fail(outcome.failed, now);
      await tx.documents.save(document, actor.id);
    });
  }
}
