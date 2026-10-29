import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { CompanySettingsReader, FileStorage } from '../../../settings';
import {
  FEATURE_KIND_VALUES,
  PropertyIdInputSchema,
  type FeatureKindValue,
  type PropertyIdInput,
} from '../../contracts';
import { pdfAddress } from '../../domain/property-document';
import type {
  AppraisalSheetFeature,
  AppraisalSheetRenderer,
  OwnerContact,
  OwnerContacts,
} from '../ports/appraisal-sheet';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyCatalogQuery } from '../ports/property-catalog-query';
import type { PropertyDetailLookups } from '../ports/property-detail-lookups';
import type { UserNames } from '../ports/user-names';
import {
  findProperty,
  invalidInput,
  propertyTarget,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';
import { buildPanelPropertyDetail } from '../queries/get-panel-property-detail';

export type DownloadPropertyAppraisalSheetError =
  ForbiddenError | InvalidInputError | PropertyNotFoundError;

export interface AppraisalSheetFile {
  readonly fileName: string;
  readonly contentType: 'application/pdf';
  readonly bytes: Uint8Array;
}

/** Las casillas de cada grupo que entran en la hoja, además de las ya cargadas. */
export const APPRAISAL_SHEET_FEATURES_PER_KIND = 40;
/** Los propietarios que entran en la línea de la cabecera. */
const MAX_OWNERS = 3;

/**
 * La planilla de tasación de una propiedad (#175), como el "PDF de tasación" de Tokko: una hoja
 * para imprimir y completar en la visita. Lleva lo cargado en la ficha (lo que falta queda en
 * blanco para escribirlo), los servicios, ambientes y adicionales del catálogo como casillas
 * (marcadas las que ya tiene), los recuadros del valor y la información interna. Los datos de los
 * propietarios solo salen con `clients:read-owners`. La descarga queda en el historial.
 */
export class DownloadPropertyAppraisalSheet {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly lookups: PropertyDetailLookups;
      readonly users: UserNames;
      readonly catalog: PropertyCatalogQuery;
      readonly owners: OwnerContacts;
      readonly storage: FileStorage;
      readonly settings: CompanySettingsReader;
      readonly renderer: AppraisalSheetRenderer;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: PropertyIdInput,
    actor: Actor,
  ): Promise<Result<AppraisalSheetFile, DownloadPropertyAppraisalSheetError>> {
    if (!actor.can('properties:read') || !actor.can('properties:export')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = PropertyIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const property = await this.deps.uow.run((tx) =>
      findProperty(tx.properties, parsed.data.propertyId),
    );
    if (!property) return err({ type: 'PropertyNotFound' });
    const detail = await buildPanelPropertyDetail(property, this.deps);

    const settings = (await this.deps.settings.get()).toSnapshot();
    const showOwners = actor.can('clients:read-owners');
    // Sin permiso para ver propietarios, la línea del propietario no sale.
    const owners: OwnerContact[] = [];
    if (showOwners) {
      for (const owner of detail.owners.slice(0, MAX_OWNERS)) {
        const contact = await this.deps.owners.find(owner.id);
        if (contact !== undefined) owners.push(contact);
      }
    }
    const [logo, ...catalog] = await Promise.all([
      settings.logoKey === undefined ? undefined : this.deps.storage.get(settings.logoKey),
      ...FEATURE_KIND_VALUES.map((kind) =>
        this.deps.catalog.listFeatures({
          kind,
          text: undefined,
          active: true,
          sort: { field: 'position', direction: 'asc' },
          offset: 0,
          limit: APPRAISAL_SHEET_FEATURES_PER_KIND,
        }),
      ),
    ]);
    const features = (kind: FeatureKindValue, index: number): AppraisalSheetFeature[] => {
      const loaded = detail.features.filter((feature) => feature.kind === kind);
      const loadedIds = new Set(loaded.map((feature) => feature.id));
      const page = catalog[index]?.items ?? [];
      // Las del catálogo en su orden, marcadas las que tiene; las cargadas que no entraron, al final.
      return [
        ...page.map((row) => ({ name: row.name, checked: loadedIds.has(row.id) })),
        ...loaded
          .filter((feature) => !page.some((row) => row.id === feature.id))
          .map((feature) => ({ name: feature.name, checked: true })),
      ];
    };
    const bytes = await this.deps.renderer.render({
      property: detail,
      address: pdfAddress(detail, 'full'),
      owners,
      features: {
        service: features('service', 0),
        room: features('room', 1),
        amenity: features('amenity', 2),
      },
      company: {
        name: settings.name,
        logo: logo?.bytes,
        brandColor: settings.pdfOptions.brandColor,
      },
      generatedAt: this.deps.clock.now(),
    });

    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(
          actor,
          propertyTarget('property.exported', detail.id),
          diffChanges({}, { kind: 'appraisal_sheet' }),
        ),
      ),
    );
    return ok({
      fileName: `Planilla-tasacion-${detail.code}.pdf`,
      contentType: 'application/pdf',
      bytes,
    });
  }
}
