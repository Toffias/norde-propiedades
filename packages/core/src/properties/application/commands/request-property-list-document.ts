import {
  auditAction,
  err,
  nextId,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { CompanySettingsReader } from '../../../settings';
import {
  EXPORT_WITHOUT_BULK_PERMISSION,
  RequestPropertyListDocumentInputSchema,
  type RequestPropertyListDocumentInput,
} from '../../contracts';
import {
  PropertyListDocument,
  type NothingToPrintError,
  type TooManyToPrintError,
} from '../../domain/property-list-document';
import { includesAgent, MAX_LIST_DOCUMENT_PROPERTIES } from '../../domain/property-sheet';
import { idOf } from '../catalog-support';
import { resolveSelection, type NoBranchAssignedError } from '../panel-filter';
import type { PanelPropertyListQuery } from '../ports/panel-property-list-query';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type RequestPropertyListDocumentError =
  | ForbiddenError
  | InvalidInputError
  | NoBranchAssignedError
  | NothingToPrintError
  | TooManyToPrintError;

/**
 * Pide el PDF de las propiedades elegidas en el buscador (las marcadas o todas las que cumplen el
 * filtro), en uno de los formatos de la ficha (#175). Hasta 10 alcanza con `properties:export`;
 * más, hace falta `properties:export-bulk`, y como mucho 100. Las propiedades se fijan al pedirlo,
 * ordenadas por código; lo arma un job y avisa en la barra. Queda en la auditoría como exportación.
 */
export class RequestPropertyListDocument {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly list: PanelPropertyListQuery;
      readonly settings: CompanySettingsReader;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RequestPropertyListDocumentInput,
    actor: Actor,
  ): Promise<Result<{ readonly documentId: string }, RequestPropertyListDocumentError>> {
    if (!actor.can('properties:export') && !actor.can('properties:export-bulk')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = RequestPropertyListDocumentInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { selection, layout } = parsed.data;
    const criteria = resolveSelection(selection, actor);
    if (criteria.isErr()) return err(criteria.error);

    const total = await this.deps.list.count(criteria.value);
    if (total === 0) return err({ type: 'NothingToExport' });
    if (total > EXPORT_WITHOUT_BULK_PERMISSION && !actor.can('properties:export-bulk')) {
      return err({ type: 'Forbidden' });
    }
    if (total > MAX_LIST_DOCUMENT_PROPERTIES) {
      return err({ type: 'TooManyToExport', max: MAX_LIST_DOCUMENT_PROPERTIES, total });
    }
    const found = await this.deps.list.search({
      ...criteria.value,
      sort: { field: 'code', direction: 'asc' },
      offset: 0,
      limit: MAX_LIST_DOCUMENT_PROPERTIES,
    });
    const propertyIds = found.items.flatMap((item) => {
      const id = idOf<'Property'>(item.id);
      return id === undefined ? [] : [id];
    });
    const { pdfOptions } = (await this.deps.settings.get()).toSnapshot();
    const now = this.deps.clock.now();

    const requested = PropertyListDocument.request({
      id: nextId<'PropertyListDocument'>(this.deps.ids),
      propertyIds,
      layout,
      includeAgent: includesAgent(pdfOptions.agentInfo, parsed.data.includeAgent),
      requestedBy: actor.id,
      now,
    });
    if (requested.isErr()) return err(requested.error);
    const document = requested.value;

    await this.deps.uow.run(async (tx) => {
      await tx.listDocuments.save(document, actor.id);
      await tx.events.publish(document.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          {
            action: 'property.exported',
            entityType: 'property_export',
            entityId: document.id,
            clientIds: [],
          },
          {
            format: { before: null, after: 'pdf' },
            layout: { before: null, after: layout },
            count: { before: null, after: document.propertyIds.length },
            selection: { before: null, after: toAuditValue(selection) },
          },
        ),
      );
    });
    return ok({ documentId: document.id });
  }
}
