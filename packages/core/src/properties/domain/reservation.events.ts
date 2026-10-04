import type { DomainEvent } from '../../shared/domain/domain-event';

interface ReservationPayload {
  readonly reservationId: string;
  readonly propertyId: string;
  readonly clientId: string;
}

export type ReservationCreated = DomainEvent<
  'properties.reservation_created',
  ReservationPayload & { readonly operation: string }
>;
export type ReservationUpdated = DomainEvent<'properties.reservation_updated', ReservationPayload>;
export type ReservationFallen = DomainEvent<'properties.reservation_fallen', ReservationPayload>;
export type ReservationSigned = DomainEvent<
  'properties.reservation_signed',
  ReservationPayload & { readonly operation: string }
>;

export type ReservationEvent =
  ReservationCreated | ReservationUpdated | ReservationFallen | ReservationSigned;
