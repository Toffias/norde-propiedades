import type {
  DisconnectPortalAccountError,
  ListPortalAccountsError,
  SetPortalAccountEnabledError,
  StartPortalConnectionError,
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
