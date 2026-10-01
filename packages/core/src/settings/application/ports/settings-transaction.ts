import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type { ReferenceCodeUsage } from './reference-code-usage';
import type {
  CompanyFileRepository,
  CompanySettingsRepository,
  FileFolderRepository,
  ReferenceCodeSequenceRepository,
} from '../../domain/settings.repository';

/** Lo que un command de settings usa dentro de la transacción, ligado a la misma conexión. */
export interface SettingsTransaction {
  readonly companySettings: CompanySettingsRepository;
  readonly sequences: ReferenceCodeSequenceRepository;
  readonly folders: FileFolderRepository;
  readonly files: CompanyFileRepository;
  /** Lectura de los códigos ya usados, en la misma conexión (si no, la asignación se traba). */
  readonly codeUsage: ReferenceCodeUsage;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type SettingsUnitOfWork = UnitOfWork<SettingsTransaction>;
