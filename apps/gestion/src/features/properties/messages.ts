import type {
  CreatePropertyError,
  DeletePropertyError,
  ListPanelPropertiesError,
  RestorePropertyError,
} from '@norde/core/properties';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de los casos de uso de propiedades → mensajes para la UI.

export const PROPERTY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para hacer esto con esta propiedad.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  InvalidCoordinates: 'La latitud o la longitud no son válidas.',
  NegativePrice: 'El precio no puede ser negativo.',
  ReferenceCodeUnavailable:
    'No pudimos asignarle un código de referencia. Revisá la numeración en Mi empresa → Códigos.',
  PropertyNotFound: 'No encontramos esa propiedad. Puede que la hayan borrado definitivamente.',
  PropertyAlreadyDeleted: 'La propiedad ya estaba en la papelera.',
  PropertyNotDeleted: 'La propiedad no está en la papelera.',
} satisfies ErrorMessages<CreatePropertyError | DeletePropertyError | RestorePropertyError>;

export const PROPERTY_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver estas propiedades.',
  InvalidSearch: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  NoBranchAssigned: 'No tenés una sucursal asignada: elegí "Todas" o "Mis captaciones".',
} satisfies ErrorMessages<ListPanelPropertiesError>;
