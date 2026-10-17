import type { DomainEvent } from '../../shared/domain/domain-event';

interface DevelopmentPayload {
  readonly developmentId: string;
  readonly code: string;
}

export type DevelopmentCreated = DomainEvent<'properties.development_created', DevelopmentPayload>;
export type DevelopmentDeleted = DomainEvent<'properties.development_deleted', DevelopmentPayload>;
export type DevelopmentRestored = DomainEvent<
  'properties.development_restored',
  DevelopmentPayload
>;
export type DevelopmentStatusChanged = DomainEvent<
  'properties.development_status_changed',
  DevelopmentPayload & { readonly from: string; readonly to: string }
>;

/**
 * Algo del emprendimiento cambió (cualquier edición, alta, baja o cambio de estado): sus avisos en
 * los portales se actualizan. Uno por guardado, sin importar cuántos campos cambiaron.
 */
export type DevelopmentChanged = DomainEvent<'properties.development_changed', DevelopmentPayload>;

export type DevelopmentEvent =
  | DevelopmentCreated
  | DevelopmentDeleted
  | DevelopmentRestored
  | DevelopmentStatusChanged
  | DevelopmentChanged;
