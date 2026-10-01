import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type { PropertyRepository } from '../../domain/property.repository';

/** Lo que un command de properties usa dentro de la transacción, ligado a la misma conexión. */
export interface PropertiesTransaction {
  readonly properties: PropertyRepository;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type PropertiesUnitOfWork = UnitOfWork<PropertiesTransaction>;
