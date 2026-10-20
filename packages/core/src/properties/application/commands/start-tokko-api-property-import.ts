import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { StartPropertyImportOutput } from '../../contracts';
import { PropertyImport } from '../../domain/property-import';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { canImportProperties, propertyImportTarget } from '../property-import-support';

/** No hay una API key de Tokko configurada. */
export interface TokkoApiNotConfiguredError {
  readonly type: 'TokkoApiNotConfigured';
}

/** Ya hay una importación desde la API pendiente o en proceso. */
export interface ImportInProgressError {
  readonly type: 'ImportInProgress';
}

export type StartTokkoApiPropertyImportError =
  ForbiddenError | TokkoApiNotConfiguredError | ImportInProgressError;

/**
 * Pide traer las propiedades desde la API de Tokko: deja la importación pendiente y la procesa un
 * job (`properties.tokko_api_import_requested`). Una sola a la vez: dos corridas juntas bajarían
 * dos veces las mismas fotos.
 */
export class StartTokkoApiPropertyImport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      /** Si hay una API key de Tokko configurada. */
      readonly configured: boolean;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<StartPropertyImportOutput, StartTokkoApiPropertyImportError>> {
    if (!canImportProperties(actor)) return err({ type: 'Forbidden' });
    if (!this.deps.configured) return err({ type: 'TokkoApiNotConfigured' });

    return this.deps.uow.run(
      async (tx): Promise<Result<StartPropertyImportOutput, StartTokkoApiPropertyImportError>> => {
        if (await tx.propertyImports.hasActiveApiImport()) return err({ type: 'ImportInProgress' });
        const id = nextId<'PropertyImport'>(this.deps.ids);
        const job = PropertyImport.requestFromTokkoApi({
          id,
          requestedBy: actor.id,
          now: this.deps.clock.now(),
        });
        await tx.propertyImports.save(job, actor.id);
        await tx.events.publish(job.pullEvents());
        await tx.audit.record(
          auditCreated(actor, propertyImportTarget('property_import.requested', id), {
            source: 'api',
          }),
        );
        return ok({ importId: id });
      },
    );
  }
}
