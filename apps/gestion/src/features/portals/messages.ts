import type {
  ChangeListingPlanError,
  ChangeListingTypeError,
  ConnectPortalAccountWithCodeError,
  DisconnectPortalAccountError,
  EnablePortalLeadNotificationsError,
  GetPortalCreditsError,
  GetPropertyListingsError,
  LinkDevelopmentListingError,
  LinkPortalListingError,
  ListPortalAccountsError,
  ListRemoteDevelopmentsError,
  ListRemoteListingsError,
  PauseListingError,
  RequestDevelopmentPublicationError,
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
const ZONAPROP_NOT_CONFIGURED =
  'Faltan las credenciales de Zonaprop en el servidor (ZONAPROP_API_URL, ZONAPROP_CLIENT_ID y ZONAPROP_CLIENT_SECRET), o Zonaprop las rechazó.';
const NOT_CONNECTED = 'La cuenta no está conectada. Conectala primero.';
const WRONG_METHOD = 'Esa cuenta se conecta de otra forma. Recargá la página y probá de nuevo.';
const ZONAPROP_UNAVAILABLE =
  'Zonaprop no respondió. Probá de nuevo en unos minutos (el sandbox funciona de 7 a 21 h).';

export const PORTAL_LABELS: Readonly<Record<PortalValue, string>> = {
  mercadolibre: 'MercadoLibre · Propiedades',
  mercadolibre_developments: 'MercadoLibre · Emprendimientos',
  zonaprop: 'Zonaprop',
};

/** El nombre del sitio, para "Ver en …". */
export const PORTAL_SITE_NAMES: Readonly<Record<PortalValue, string>> = {
  mercadolibre: 'MercadoLibre',
  mercadolibre_developments: 'MercadoLibre',
  zonaprop: 'Zonaprop',
};

export const PORTAL_DESCRIPTIONS: Readonly<Record<PortalValue, string>> = {
  mercadolibre:
    'Cuenta de MercadoLibre activada como inmobiliaria, con un paquete de publicaciones. Publica las propiedades.',
  mercadolibre_developments:
    'Otra cuenta, con el paquete de emprendimientos de MercadoLibre: publica cada emprendimiento con sus unidades. Esa cuenta no puede publicar propiedades sueltas.',
  zonaprop:
    'La inmobiliaria de Norde en Zonaprop, con sus créditos de publicación. Se conecta con el código de inmobiliaria. Cada propiedad se publica como un solo aviso con todas sus operaciones, con el plan que se elija en la ficha.',
};

export const START_CONNECTION_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  ValidationFailed: 'Ese portal no existe.',
  WrongConnectionMethod: WRONG_METHOD,
  PortalNotConfigured: NOT_CONFIGURED,
} satisfies ErrorMessages<StartPortalConnectionError>;

export const CODE_CONNECTION_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  ValidationFailed: (error) => error.issues[0] ?? 'Revisá el código de inmobiliaria.',
  WrongConnectionMethod: WRONG_METHOD,
  PortalNotConfigured: ZONAPROP_NOT_CONFIGURED,
  PortalAccountNotFound:
    'Zonaprop no tiene una inmobiliaria con ese código asociada a Norde. Revisá el código, o pedile a Zonaprop que la asocie al integrador.',
  PortalAccountBlocked:
    'Zonaprop tiene bloqueada esa inmobiliaria. Hay que regularizarla con el ejecutivo de cuentas de Zonaprop.',
  PortalUnavailable: ZONAPROP_UNAVAILABLE,
  PortalAccountInUse: 'Esa cuenta ya está conectada en otra tarjeta.',
} satisfies ErrorMessages<ConnectPortalAccountWithCodeError>;

export const CREDITS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver los créditos del portal.',
  ValidationFailed: 'Ese portal no existe.',
  WrongConnectionMethod: 'Este portal no informa créditos.',
  PortalNotConnected: NOT_CONNECTED,
  PortalNotConfigured: ZONAPROP_NOT_CONFIGURED,
  PortalUnavailable: 'No pudimos consultar los créditos: Zonaprop no respondió. Probá más tarde.',
} satisfies ErrorMessages<GetPortalCreditsError>;

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
  WrongConnectionMethod: WRONG_METHOD,
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

/** `DESTACADO_COMBO` → `Destacado combo`. Los planes los define el portal. */
export function planLabel(plan: string): string {
  const words = plan.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const PLAN_MESSAGES = {
  PlanNotOffered: (error: { readonly plan: string }) =>
    `La cuenta no tiene el plan ${planLabel(error.plan)} para este tipo de aviso. Elegí otro.`,
  NoCreditsLeft: (error: { readonly plan: string }) =>
    `No quedan créditos del plan ${planLabel(error.plan)}. Elegí otro plan o cargá créditos en el portal.`,
  PortalNotConfigured:
    'Faltan las credenciales del portal en el servidor, o el portal las rechazó (Mi empresa → Portales).',
  PortalUnavailable:
    'El portal no respondió al consultar los créditos. Probá de nuevo en unos minutos.',
} as const;

export const PUBLICATION_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_PUBLISH,
  ValidationFailed: (error) => error.issues[0] ?? 'Revisá la operación y el tipo de aviso.',
  PortalNotEnabled: (error) =>
    `La cuenta de ${PORTAL_LABELS[error.portal]} no está conectada o está desactivada (Mi empresa → Portales).`,
  PortalNotForProperties: 'Esa cuenta publica emprendimientos, no propiedades sueltas.',
  PropertyNotFound: 'No encontramos la propiedad. Puede que la hayan eliminado.',
  UnitPublishedWithDevelopment:
    'Las unidades se publican dentro de su emprendimiento, desde la ficha del emprendimiento.',
  PropertyNotAvailable: 'Solo se publica una propiedad disponible.',
  OperationNotOffered: 'La propiedad no ofrece esa operación.',
  PriceRequired:
    'El portal exige un precio: cargalo en la operación y sacale "precio a consultar".',
  MissingListingData: (error) => `Faltan datos para el portal: ${error.problems.join(' ')}`,
  PlanRequired: 'Elegí el plan del aviso.',
  ...PLAN_MESSAGES,
  ListingAlreadyExists: 'Esa propiedad ya está publicada en ese portal.',
  ListingNotClosed: 'Esa propiedad ya está publicada en ese portal.',
} satisfies ErrorMessages<RequestPublicationError>;

const DEVELOPMENT_NOT_FOUND = 'No encontramos el emprendimiento. Puede que lo hayan eliminado.';
const NOT_FOR_DEVELOPMENTS = 'Esa cuenta no publica emprendimientos.';

export const DEVELOPMENT_PUBLICATION_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_PUBLISH,
  ValidationFailed: (error) => error.issues[0] ?? 'Revisá el plan del aviso.',
  PortalNotEnabled: (error) =>
    `La cuenta de ${PORTAL_LABELS[error.portal]} no está conectada o está desactivada (Mi empresa → Portales).`,
  PortalNotForDevelopments: NOT_FOR_DEVELOPMENTS,
  DevelopmentNotFound: DEVELOPMENT_NOT_FOUND,
  DevelopmentNotMarketing:
    'Solo se publica un emprendimiento "Comercializando". Cambiale el estado en la ficha.',
  NoPublishableUnits:
    'El emprendimiento no tiene unidades disponibles con precio: el portal pide al menos una.',
  MissingListingData: (error) => `Faltan datos para el portal: ${error.problems.join(' ')}`,
  PlanRequired: 'Elegí el plan del aviso.',
  ...PLAN_MESSAGES,
  ListingAlreadyExists: 'Ese emprendimiento ya está publicado en ese portal.',
  ListingNotClosed: 'Ese emprendimiento ya está publicado en ese portal.',
} satisfies ErrorMessages<RequestDevelopmentPublicationError>;

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

export const PLAN_CHANGE_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_PUBLISH,
  ValidationFailed: (error) => error.issues[0] ?? LISTING_NOT_FOUND,
  ListingNotFound: LISTING_NOT_FOUND,
  ListingClosed: LISTING_CLOSED,
  PortalNotEnabled: (error) =>
    `La cuenta de ${PORTAL_LABELS[error.portal]} no está conectada o está desactivada (Mi empresa → Portales).`,
  ...PLAN_MESSAGES,
} satisfies ErrorMessages<ChangeListingPlanError>;

export const PROPERTY_LISTINGS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver la difusión en portales.',
  ValidationFailed: 'No encontramos la propiedad.',
} satisfies ErrorMessages<GetPropertyListingsError>;

export const REMOTE_LISTINGS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver los avisos del portal.',
  ValidationFailed: (error) => error.issues[0] ?? 'Revisá la página.',
  PortalNotConnected: NOT_CONNECTED,
  PortalNotConfigured: ZONAPROP_NOT_CONFIGURED,
  PortalUnavailable: ZONAPROP_UNAVAILABLE,
} satisfies ErrorMessages<ListRemoteListingsError>;

export const LINK_LISTING_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_PUBLISH,
  ValidationFailed: (error) => error.issues[0] ?? 'Revisá el link del aviso.',
  PortalNotEnabled: (error) =>
    `La cuenta de ${PORTAL_LABELS[error.portal]} no está conectada o está desactivada (Mi empresa → Portales).`,
  PropertyNotFound: 'No encontramos la propiedad. Puede que la hayan eliminado.',
  UnitPublishedWithDevelopment:
    'Las unidades se vinculan con su emprendimiento, desde la ficha del emprendimiento.',
  RemoteListingNotFound:
    'Zonaprop no tiene online un aviso con ese número en la cuenta de Norde. Revisá el link.',
  RemoteListingIsDevelopment:
    'Ese aviso es un emprendimiento: vinculalo desde la ficha del emprendimiento, en Difusión.',
  RemoteListingAlreadyLinked: (error) =>
    error.owner.kind === 'development'
      ? 'Ese aviso ya está vinculado a un emprendimiento.'
      : 'Ese aviso ya está vinculado a otra propiedad.',
  ListingAlreadyExists: 'La propiedad ya tiene un aviso en este portal.',
  PlanRequired: 'Zonaprop no informa el plan de ese aviso: elegilo.',
  PortalNotConfigured: ZONAPROP_NOT_CONFIGURED,
  PortalUnavailable: ZONAPROP_UNAVAILABLE,
  PortalRejected: (error) => error.reason,
  PortalCredentialsMissing: 'El portal pide volver a conectar la cuenta (Mi empresa → Portales).',
} satisfies ErrorMessages<LinkPortalListingError>;

export const REMOTE_DEVELOPMENTS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver los emprendimientos del portal.',
  ValidationFailed: (error) => error.issues[0] ?? 'Revisá la página.',
  PortalNotConnected: NOT_CONNECTED,
  PortalNotConfigured: ZONAPROP_NOT_CONFIGURED,
  PortalUnavailable: ZONAPROP_UNAVAILABLE,
} satisfies ErrorMessages<ListRemoteDevelopmentsError>;

export const LINK_DEVELOPMENT_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN_PUBLISH,
  ValidationFailed: (error) => error.issues[0] ?? 'Revisá el link del aviso.',
  PortalNotEnabled: (error) =>
    `La cuenta de ${PORTAL_LABELS[error.portal]} no está conectada o está desactivada (Mi empresa → Portales).`,
  PortalNotForDevelopments: NOT_FOR_DEVELOPMENTS,
  DevelopmentNotFound: DEVELOPMENT_NOT_FOUND,
  RemoteListingNotFound:
    'Zonaprop no tiene online un emprendimiento con ese número en la cuenta de Norde. Revisá el link.',
  RemoteListingAlreadyLinked: (error) =>
    error.owner.kind === 'development'
      ? 'Ese aviso ya está vinculado a otro emprendimiento.'
      : 'Ese aviso ya está vinculado a una propiedad.',
  ListingAlreadyExists: 'El emprendimiento ya tiene un aviso en este portal.',
  PlanRequired: 'Zonaprop no informa el plan de ese aviso: elegilo.',
  PortalNotConfigured: ZONAPROP_NOT_CONFIGURED,
  PortalUnavailable: ZONAPROP_UNAVAILABLE,
  PortalRejected: (error) => error.reason,
  PortalCredentialsMissing: 'El portal pide volver a conectar la cuenta (Mi empresa → Portales).',
} satisfies ErrorMessages<LinkDevelopmentListingError>;

export const LEAD_NOTIFICATIONS_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  ValidationFailed: (error) => error.issues[0] ?? 'Ese portal no trae consultas.',
  PortalNotConnected: NOT_CONNECTED,
  PortalNotConfigured:
    'Falta configurar en el servidor el token de los avisos (ZONAPROP_CALLBACK_TOKEN), o Zonaprop rechazó las credenciales.',
  PortalUnavailable: ZONAPROP_UNAVAILABLE,
} satisfies ErrorMessages<EnablePortalLeadNotificationsError>;
