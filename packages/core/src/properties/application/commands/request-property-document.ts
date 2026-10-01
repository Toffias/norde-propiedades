import {
  auditAction,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  RequestPropertyDocumentInputSchema,
  type RequestPropertyDocumentInput,
} from '../../contracts';
import { PropertyDocument, type ReportPeriodRequiredError } from '../../domain/property-document';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  findProperty,
  invalidInput,
  propertyTarget,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';

export type RequestPropertyDocumentError =
  ForbiddenError | InvalidInputError | PropertyNotFoundError | ReportPeriodRequiredError;

/**
 * Pide un PDF de la ficha (ficha, vidriera o reporte al propietario). Queda pendiente y lo arma un
 * job; la pantalla muestra el avance. Exportar queda en el historial de la propiedad.
 */
export class RequestPropertyDocument {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RequestPropertyDocumentInput,
    actor: Actor,
  ): Promise<Result<{ readonly documentId: string }, RequestPropertyDocumentError>> {
    if (!actor.can('properties:read') || !actor.can('properties:export')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = RequestPropertyDocumentInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (
        tx,
      ): Promise<Result<{ readonly documentId: string }, RequestPropertyDocumentError>> => {
        const property = await findProperty(tx.properties, data.propertyId);
        if (!property) return err({ type: 'PropertyNotFound' });
        const requested = PropertyDocument.request({
          id: nextId<'PropertyDocument'>(this.deps.ids),
          propertyId: property.id,
          kind: data.kind,
          period: data.kind === 'owner_report' ? { from: data.from, to: data.to } : undefined,
          requestedBy: actor.id,
          now,
        });
        if (requested.isErr()) return err(requested.error);
        const document = requested.value;

        await tx.documents.save(document, actor.id);
        await tx.events.publish(document.pullEvents());
        await tx.audit.record(
          auditAction(
            actor,
            propertyTarget('property.exported', property.id),
            diffChanges(
              {},
              {
                documentId: document.id,
                kind: document.kind,
                periodFrom: document.period?.from,
                periodTo: document.period?.to,
              },
            ),
          ),
        );
        return ok({ documentId: document.id });
      },
    );
  }
}
