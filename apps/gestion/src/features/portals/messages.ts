import type {
  ChangeListingTypeError,
  DisconnectPortalAccountError,
  GetPropertyListingsError,
  ListPortalAccountsError,
  PauseListingError,
  RequestPublicationError,
  ResumeListingError,
  ResyncListingError,
  SetPortalAccountEnabledError,
  StartPortalConnectionError,
  UnpublishListingError,
} from '@norde/core/portals';
import type { PortalValue } from '@norde/core/portals/contracts';

import type { ErrorMessages } from '../../lib/errors';

import type { ConnectionOutcome } from './oauth-flow';

// Errores esperados de los casos de uso de portales → mensajes para la UI.

const FORBIDDEN = 'No tenés permiso para conectar ni activar las cuentas de portales.';
const NOT_CONFIGURED =
  'Falta configurar la app de MercadoLibre en el servidor (MERCADOLIBRE_CLIENT_ID, MERCADOLIBRE_CLIENT_SECRET y MERCADOLIBRE_REDIRECT_URI).';
const NOT_CONNECTED = 'La cuenta no está conectada. Conectala primero.';

export const PORTAL_LABELS: Readonly<Record<PortalValue, string>> = {
  mercadolibre: 'MercadoLibre · Propiedades',
  mercadolibre_developments: 'MercadoLibre · Emprendimientos',
};

export const PORTAL_DESCRIPTIONS: Readonly<Record<PortalValue, string>> = {
  mercadolibre:
    'Cuenta de MercadoLibre activada como inmobiliaria, con un paquete de publicaciones. Publica las propiedades.',
  mercadolibre_developments:
    'Otra cuenta, con el paquete de emprendimientos de MercadoLibre: publica cada emprendimiento con sus unidades. Esa cuenta no puede publicar propiedades sueltas.',
};

export const START_CONNECTION_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  ValidationFailed: 'Ese portal no existe.',
  PortalNotConfigured: NOT_CONFIGURED,
} satisfies ErrorMessages<StartPortalConnectionError>;

export const PORTAL_ACCOUNT_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  ValidationFailed: 'Ese portal no existe.',
  PortalNotConnected: NOT_CONNECTED,
} satisfies ErrorMessages<
  DisconnectPortalAccountError | SetPortalAccountEnabledError | ListPortalAccountsError
>;

/** El mensaje de la vuelta de MercadoLibre (`?conexion=`), o `undefined` si no es uno conocido. */
export const CONNECTION_OUTCOME_MESSAGES: Readonly<Record<ConnectionOutcome, string>> = {
  ok: 'Cuenta conectada. Activala para que se pueda publicar con ella.',
  AuthorizationDenied: 'No autorizaste a Norde en MercadoLibre, así que la cuenta no se conectó.',
  ValidationFailed: 'MercadoLibre no devolvió el código de autorización. Probá de nuevo.',
  Forbidden: FORBIDDEN,
  InvalidAuthorizationState:
    'La conexión venció o se abrió en otra pestaña. Volvé a tocar "Conectar" y autorizá en los próximos 10 minutos.',
  PortalNotConfigured: NOT_CONFIGURED,
  PortalAuthorizationRejected:
    'MercadoLibre rechazó la autorización. Volvé a tocar "Conectar" y probá de nuevo.',
  PortalUnavailable: 'MercadoLibre no respondió. Probá de nuevo en unos minutos.',
  PortalAccountInUse:
    'Esa cuenta de MercadoLibre ya está conectada en la otra tarjeta. Propiedades y emprendimientos necesitan cuentas distintas.',
};

export function connectionOutcomeMessage(value: string | undefined) {
  if (value === undefined) return undefined;
  const entry = Object.entries(CONNECTION_OUTCOME_MESSAGES).find(([key]) => key === value);
  return entry ? { ok: value === 'ok', message: entry[1] } : undefined;
}

const FORBIDDEN_PUBLISH = 'No tenés permiso para publicar en portales.';
const LISTING_NOT_FOUND = 'No encontramos esa publicación. Recargá la página.';
const LISTING_CLOSED =
  'El aviso está dado de baja: para volver a mostrarlo, publicalo de nuevo (es un aviso nuevo).';

export const PUBLICATION_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_PUBLISH,
  ValidationFailed: 'Revisá la operación y el tipo de aviso.',
  PortalNotEnabled:
    'La cuenta de MercadoLibre no está conectada o está desactivada (Mi empresa → Portales).',
  PortalNotForProperties: 'Esa cuenta publica emprendimientos, no propiedades sueltas.',
  PropertyNotFound: 'No encontramos la propiedad. Puede que la hayan eliminado.',
  UnitPublishedWithDevelopment:
    'Las unidades se publican dentro de su emprendimiento, desde la ficha del emprendimiento.',
  PropertyNotAvailable: 'Solo se publica una propiedad disponible.',
  OperationNotOffered: 'La propiedad no ofrece esa operación.',
  PriceRequired:
    'MercadoLibre exige un precio: cargalo en la operación y sacale "precio a consultar".',
  MissingListingData: (error) => `Faltan datos para MercadoLibre: ${error.problems.join(' ')}`,
  ListingAlreadyExists: 'Esa operación ya está publicada en MercadoLibre.',
  ListingNotClosed: 'Esa operación ya está publicada en MercadoLibre.',
} satisfies ErrorMessages<RequestPublicationError>;

export const LISTING_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_PUBLISH,
  ValidationFailed: LISTING_NOT_FOUND,
  ListingNotFound: LISTING_NOT_FOUND,
  ListingClosed: LISTING_CLOSED,
} satisfies ErrorMessages<
  | PauseListingError
  | ResumeListingError
  | UnpublishListingError
  | ChangeListingTypeError
  | ResyncListingError
>;

export const PROPERTY_LISTINGS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver la difusión en portales.',
  ValidationFailed: 'No encontramos la propiedad.',
} satisfies ErrorMessages<GetPropertyListingsError>;
