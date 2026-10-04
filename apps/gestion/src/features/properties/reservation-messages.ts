import type {
  FallReservationError,
  GetActiveReservationError,
  ListPropertyReservationsError,
  ReservePropertyError,
  SignReservationError,
  UpdateReservationError,
} from '@norde/core/properties';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de las reservas (#13) → mensajes para la UI.

export const RESERVATION_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para hacer esto con las reservas.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  PropertyNotFound: 'No encontramos esa propiedad. Puede que la hayan borrado.',
  PropertyInTrash: 'La propiedad está en la papelera: restaurala para reservarla.',
  PropertyNotAvailable: 'Solo se reserva una propiedad disponible.',
  OperationNotFound: 'La propiedad no se ofrece para esa operación.',
  PropertyAlreadyReserved: 'Alguien la reservó recién. Recargá la ficha para ver su reserva.',
  AgentNotFound: 'Ese agente no existe o está suspendido.',
  ManagerNotFound: 'Ese gerente no existe o está suspendido.',
  NegativeReservationAmount: 'Los montos no pueden ser negativos.',
  InvalidCommission: 'La comisión va de 0 a 100, con hasta dos decimales.',
  ReservationNotFound: 'No encontramos esa reserva. Recargá la ficha.',
  ReservationNotActive: 'La reserva ya se cayó o se firmó.',
} satisfies ErrorMessages<
  ReservePropertyError | UpdateReservationError | FallReservationError | SignReservationError
>;

export const RESERVATION_READ_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las reservas.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListPropertyReservationsError | GetActiveReservationError>;
