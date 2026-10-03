import type {
  AddClientNoteError,
  ChangeClientTagsError,
  CheckClientDuplicatesError,
  CreateClientError,
  CreateClientTagError,
  CreateClientTagGroupError,
  DeleteClientError,
  DeleteClientTagError,
  DeleteClientTagGroupError,
  EraseClientDataError,
  ExportClientsError,
  GetClientImportError,
  FeaturePropertiesError,
  GetClientDetailError,
  GetFeaturedPropertyIdsError,
  LinkClientsError,
  ListClientActivityError,
  ListClientFeaturedError,
  ListClientHistoryError,
  ListClientImportProblemsError,
  ListClientImportsError,
  ListClientLettersError,
  ListClientOpportunitiesError,
  ListClientRelationsError,
  ListClientSavedSearchesError,
  ListClientsError,
  ListClientTagGroupsError,
  MergeClientsError,
  MergeClientTagsError,
  PreviewClientImportError,
  PreviewClientMergeError,
  ReassignClientError,
  RenameClientTagGroupError,
  RestoreClientError,
  SearchClientTagsError,
  StartClientImportError,
  UnfeaturePropertyError,
  UnlinkClientsError,
  UpdateClientDetailsError,
  UpdateClientTagError,
  CreateSavedSearchError,
  DeleteSavedSearchError,
  GetSavedSearchError,
  InvalidSavedSearchError,
  RestoreSavedSearchError,
  SetFeaturedAutoSendError,
  UpdateSavedSearchError,
} from '@norde/core/clients';
import type { ChangeFavoritesError } from '@norde/core/identity';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de la agenda de contactos → mensajes para el usuario.

const FORBIDDEN = 'No tenés permiso para hacer esto con este contacto.';
const INVALID = 'Revisá los datos marcados y probá de nuevo.';
const NOT_FOUND = 'No encontramos el contacto. Puede que lo hayan borrado.';
const MERGED = 'Este contacto se unificó con otro: los datos están en el contacto principal.';
const IN_TRASH = 'El contacto está en la papelera: restauralo para editarlo.';
const DUPLICATE = (error: { readonly trashed: boolean }) =>
  error.trashed
    ? 'Ya hay un contacto en la papelera con ese teléfono o email. Restauralo en vez de crear otro.'
    : 'Ya hay un contacto con ese teléfono o email.';

export const CLIENT_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver estos contactos.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListClientsError>;

export const CLIENT_DETAIL_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver este contacto.',
  InvalidInput: NOT_FOUND,
  ClientNotFound: NOT_FOUND,
  ClientMerged: MERGED,
} satisfies ErrorMessages<GetClientDetailError>;

export const CLIENT_HISTORY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver el historial de este contacto.',
  InvalidInput: 'Los filtros no son válidos.',
  ClientNotFound: NOT_FOUND,
} satisfies ErrorMessages<ListClientHistoryError>;

export const CHECK_DUPLICATES_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para crear contactos.',
  InvalidInput: INVALID,
} satisfies ErrorMessages<CheckClientDuplicatesError>;

export const CREATE_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para crear contactos o asignarlos a otro agente.',
  InvalidInput: INVALID,
  InvalidPhone: 'Uno de los teléfonos no es válido.',
  InvalidEmail: 'Uno de los emails no es válido.',
  MissingName: 'Ingresá el nombre.',
  MissingContactInfo: 'Cargá al menos un teléfono o un email.',
  AgentNotFound: 'El agente elegido no existe o no está activo.',
  DuplicateClient: DUPLICATE,
} satisfies ErrorMessages<CreateClientError>;

export const UPDATE_CLIENT_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  InvalidPhone: 'Uno de los teléfonos no es válido.',
  InvalidEmail: 'Uno de los emails no es válido.',
  ClientNotFound: NOT_FOUND,
  ClientInTrash: 'El contacto está en la papelera: restauralo para editarlo.',
  MissingName: 'Ingresá el nombre.',
  MissingContactInfo: 'El contacto tiene que tener al menos un teléfono o un email.',
  DuplicateClient: (error) =>
    error.trashed
      ? 'Ese teléfono o email es de un contacto que está en la papelera.'
      : 'Ese teléfono o email ya es de otro contacto.',
} satisfies ErrorMessages<UpdateClientDetailsError>;

export const REASSIGN_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para cambiar el agente de este contacto.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: 'El contacto está en la papelera: restauralo para cambiar el agente.',
  AgentNotFound: 'El agente elegido no existe o no está activo.',
} satisfies ErrorMessages<ReassignClientError>;

export const DELETE_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para borrar este contacto.',
  InvalidInput: NOT_FOUND,
  ClientNotFound: NOT_FOUND,
  ClientAlreadyDeleted: 'El contacto ya estaba en la papelera.',
} satisfies ErrorMessages<DeleteClientError>;

export const RESTORE_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para restaurar este contacto.',
  InvalidInput: NOT_FOUND,
  ClientNotFound: NOT_FOUND,
  ClientNotDeleted: 'El contacto ya no estaba en la papelera.',
  ClientMerged: MERGED,
} satisfies ErrorMessages<RestoreClientError>;

export const EXPORT_CLIENTS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para exportar contactos.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  NothingToExport: 'No hay contactos para exportar con estos filtros.',
  TooManyToExport: (error) =>
    `Son ${error.total.toLocaleString('es-AR')} contactos y el máximo es ${error.max.toLocaleString('es-AR')}. Filtrá un poco más.`,
} satisfies ErrorMessages<ExportClientsError>;

export const CLIENT_LETTERS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver estos contactos.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListClientLettersError>;

// ---------- Etiquetas ----------

const TAG_FORBIDDEN = 'No tenés permiso para editar etiquetas.';
const TAG_NOT_FOUND = 'No encontramos la etiqueta. Puede que la hayan borrado o unificado.';
const GROUP_NOT_FOUND = 'No encontramos el grupo. Puede que lo hayan borrado.';

export const CLIENT_TAG_GROUPS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las etiquetas de contactos.',
  InvalidInput: 'Los filtros no son válidos.',
} satisfies ErrorMessages<ListClientTagGroupsError>;

export const CLIENT_TAGS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las etiquetas de contactos.',
  InvalidInput: 'Los filtros no son válidos.',
} satisfies ErrorMessages<SearchClientTagsError>;

export const CREATE_CLIENT_TAG_GROUP_ERROR_MESSAGES = {
  Forbidden: TAG_FORBIDDEN,
  InvalidInput: INVALID,
  TagGroupNameTaken: 'Ya hay un grupo con ese nombre.',
} satisfies ErrorMessages<CreateClientTagGroupError>;

export const RENAME_CLIENT_TAG_GROUP_ERROR_MESSAGES = {
  Forbidden: TAG_FORBIDDEN,
  InvalidInput: INVALID,
  TagGroupNotFound: GROUP_NOT_FOUND,
  TagGroupNameTaken: 'Ya hay un grupo con ese nombre.',
} satisfies ErrorMessages<RenameClientTagGroupError>;

export const DELETE_CLIENT_TAG_GROUP_ERROR_MESSAGES = {
  Forbidden: TAG_FORBIDDEN,
  InvalidInput: GROUP_NOT_FOUND,
  TagGroupNotFound: GROUP_NOT_FOUND,
  TagGroupNotEmpty: 'El grupo tiene etiquetas: movelas a otro grupo o borralas primero.',
} satisfies ErrorMessages<DeleteClientTagGroupError>;

export const CREATE_CLIENT_TAG_ERROR_MESSAGES = {
  Forbidden: TAG_FORBIDDEN,
  InvalidInput: INVALID,
  TagGroupNotFound: GROUP_NOT_FOUND,
  TagNameTaken: 'Ya hay una etiqueta con ese nombre en el grupo.',
} satisfies ErrorMessages<CreateClientTagError>;

export const UPDATE_CLIENT_TAG_ERROR_MESSAGES = {
  Forbidden: TAG_FORBIDDEN,
  InvalidInput: INVALID,
  TagNotFound: TAG_NOT_FOUND,
  TagGroupNotFound: GROUP_NOT_FOUND,
  TagNameTaken: 'Ya hay una etiqueta con ese nombre en el grupo.',
} satisfies ErrorMessages<UpdateClientTagError>;

export const DELETE_CLIENT_TAG_ERROR_MESSAGES = {
  Forbidden: TAG_FORBIDDEN,
  InvalidInput: TAG_NOT_FOUND,
  TagNotFound: TAG_NOT_FOUND,
  TagInUse: (error) =>
    `La tienen ${error.uses.toLocaleString('es-AR')} contactos: unificala con otra etiqueta o quitásela primero.`,
} satisfies ErrorMessages<DeleteClientTagError>;

export const MERGE_CLIENT_TAGS_ERROR_MESSAGES = {
  Forbidden: TAG_FORBIDDEN,
  InvalidInput: 'Elegí otra etiqueta para unificar.',
  TagNotFound: TAG_NOT_FOUND,
} satisfies ErrorMessages<MergeClientTagsError>;

export const CHANGE_CLIENT_TAGS_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
  TagNotFound: TAG_NOT_FOUND,
} satisfies ErrorMessages<ChangeClientTagsError>;

// ---------- Contactos relacionados ----------

export const CLIENT_RELATIONS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver los contactos relacionados.',
  InvalidInput: 'Los filtros no son válidos.',
  ClientNotFound: NOT_FOUND,
} satisfies ErrorMessages<ListClientRelationsError>;

export const LINK_CLIENTS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para editar este contacto o para ver el otro.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: 'Uno de los dos contactos está en la papelera.',
  SelfRelation: 'Un contacto no se puede relacionar consigo mismo.',
  InvalidRelation:
    'Esa relación no corresponde: una persona trabaja en una empresa y es miembro de un grupo.',
  TooManyRelations: 'El contacto ya tiene demasiadas relaciones.',
} satisfies ErrorMessages<LinkClientsError>;

export const UNLINK_CLIENTS_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
} satisfies ErrorMessages<UnlinkClientsError>;

// ---------- Unificar ----------

export const PREVIEW_MERGE_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para unificar estos contactos.',
  InvalidInput: 'Elegí otro contacto para unificar.',
  ClientNotFound: 'No encontramos uno de los contactos (o está en la papelera).',
} satisfies ErrorMessages<PreviewClientMergeError>;

export const MERGE_CLIENTS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para unificar estos contactos.',
  InvalidInput: 'Elegí otro contacto para unificar.',
  ClientNotFound: 'No encontramos uno de los contactos. Puede que lo hayan borrado.',
  ClientInTrash: 'Uno de los dos contactos está en la papelera: restauralo primero.',
  SameClient: 'Elegí otro contacto para unificar.',
} satisfies ErrorMessages<MergeClientsError>;

// ---------- Ficha completa: actividad, notas, oportunidades, destacadas ----------

const TAB_ERRORS = {
  Forbidden: 'No tenés permiso para ver esto de este contacto.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  ClientNotFound: NOT_FOUND,
} as const;

export const CLIENT_ACTIVITY_ERROR_MESSAGES =
  TAB_ERRORS satisfies ErrorMessages<ListClientActivityError>;
export const CLIENT_OPPORTUNITIES_ERROR_MESSAGES =
  TAB_ERRORS satisfies ErrorMessages<ListClientOpportunitiesError>;
export const CLIENT_FEATURED_ERROR_MESSAGES =
  TAB_ERRORS satisfies ErrorMessages<ListClientFeaturedError>;
export const CLIENT_SAVED_SEARCHES_ERROR_MESSAGES =
  TAB_ERRORS satisfies ErrorMessages<ListClientSavedSearchesError>;
export const FEATURED_IDS_ERROR_MESSAGES =
  TAB_ERRORS satisfies ErrorMessages<GetFeaturedPropertyIdsError>;

export const ADD_NOTE_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para agregar notas a este contacto.',
  InvalidInput: 'Escribí la nota (hasta 5.000 caracteres).',
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
  OpportunityNotFound: 'No encontramos la oportunidad. Recargá la página.',
  EmptyNote: 'Escribí la nota.',
  NoteTooLong: (error) =>
    `La nota puede tener hasta ${error.max.toLocaleString('es-AR')} caracteres.`,
} satisfies ErrorMessages<AddClientNoteError>;

export const FEATURE_PROPERTIES_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para destacarle propiedades a este contacto.',
  InvalidInput: 'Elegí al menos una propiedad (hasta 50).',
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
  ListingNotFound: 'Alguna de las propiedades ya no está en la cartera.',
} satisfies ErrorMessages<FeaturePropertiesError>;

export const UNFEATURE_PROPERTY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para quitarle destacadas a este contacto.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
} satisfies ErrorMessages<UnfeaturePropertyError>;

export const SET_FEATURED_AUTO_SEND_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para cambiar las destacadas de este contacto.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
  FeaturedListingNotFound: 'La propiedad ya no está destacada para este contacto.',
} satisfies ErrorMessages<SetFeaturedAutoSendError>;

// ---------- Búsquedas guardadas (#11) ----------

const SAVED_SEARCH_NOT_FOUND = 'No encontramos la búsqueda. Puede que la hayan borrado.';
const SAVED_SEARCH_LIMIT = (error: { readonly max: number }) =>
  `El contacto ya tiene ${error.max.toLocaleString('es-AR')} búsquedas: borrá alguna para guardar otra.`;
const INVALID_SAVED_SEARCH = ({ reason }: InvalidSavedSearchError) =>
  ({
    currency_required: 'Elegí la moneda del precio.',
    negative_price: 'El precio no puede ser negativo.',
    price_range: 'El precio máximo no puede ser menor que el mínimo.',
    rooms: 'Los ambientes van de 1 a 20.',
    too_many_locations: 'Elegí hasta 20 ubicaciones.',
    name_too_long: 'El nombre puede tener hasta 80 caracteres.',
  })[reason];

export const CREATE_SAVED_SEARCH_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para guardarle búsquedas a este contacto.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
  OpportunityNotFound: 'La oportunidad ya no está abierta.',
  InvalidSavedSearch: INVALID_SAVED_SEARCH,
  SavedSearchLimitReached: SAVED_SEARCH_LIMIT,
} satisfies ErrorMessages<CreateSavedSearchError>;

export const UPDATE_SAVED_SEARCH_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para editar las búsquedas de este contacto.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
  SavedSearchNotFound: SAVED_SEARCH_NOT_FOUND,
  OpportunityNotFound: 'La oportunidad ya no está abierta.',
  InvalidSavedSearch: INVALID_SAVED_SEARCH,
  SavedSearchUnsubscribed:
    'El contacto se dio de baja de los envíos automáticos: no se pueden volver a activar.',
} satisfies ErrorMessages<UpdateSavedSearchError>;

export const DELETE_SAVED_SEARCH_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para borrar las búsquedas de este contacto.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
  SavedSearchNotFound: SAVED_SEARCH_NOT_FOUND,
} satisfies ErrorMessages<DeleteSavedSearchError>;

export const RESTORE_SAVED_SEARCH_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para restaurar las búsquedas de este contacto.',
  InvalidInput: INVALID,
  ClientNotFound: NOT_FOUND,
  ClientInTrash: IN_TRASH,
  SavedSearchNotFound: SAVED_SEARCH_NOT_FOUND,
  SavedSearchLimitReached: SAVED_SEARCH_LIMIT,
} satisfies ErrorMessages<RestoreSavedSearchError>;

export const GET_SAVED_SEARCH_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las búsquedas de este contacto.',
  InvalidInput: SAVED_SEARCH_NOT_FOUND,
  ClientNotFound: NOT_FOUND,
  SavedSearchNotFound: SAVED_SEARCH_NOT_FOUND,
} satisfies ErrorMessages<GetSavedSearchError>;

export const CLIENT_FAVORITE_ERROR_MESSAGES = {
  Forbidden: 'Solo un usuario del panel tiene favoritos.',
  InvalidInput: INVALID,
} satisfies ErrorMessages<ChangeFavoritesError>;

// ---------- Supresión de datos ----------

export const ERASE_CLIENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para suprimir los datos de este contacto.',
  InvalidInput: 'Revisá la fecha del pedido y el nombre, y probá de nuevo.',
  ClientNotFound: NOT_FOUND,
  ErasureNotConfirmed: 'El nombre no coincide. Escribilo tal como aparece en la ficha.',
  ErasureRequestInFuture: 'La fecha del pedido no puede ser posterior a hoy.',
} satisfies ErrorMessages<EraseClientDataError>;

// ---------- Importación desde Excel ----------

const IMPORT_FORBIDDEN = 'No tenés permiso para importar contactos.';
const UNREADABLE =
  'No pudimos leer el archivo. Subí un Excel (.xlsx) con los encabezados en la primera fila.';
const EMPTY_FILE = 'El archivo no tiene filas con datos debajo de los encabezados.';
const TOO_MANY_ROWS = (error: { readonly max: number }) =>
  `El archivo tiene más de ${error.max.toLocaleString('es-AR')} filas. Partilo en varios archivos.`;

export const PREVIEW_IMPORT_ERROR_MESSAGES = {
  Forbidden: IMPORT_FORBIDDEN,
  InvalidInput: 'Subí un Excel (.xlsx) de hasta 10 MB.',
  UnreadableSpreadsheet: UNREADABLE,
  EmptyImportFile: EMPTY_FILE,
  TooManyImportRows: TOO_MANY_ROWS,
  TooManyImportColumns: (error) => `El archivo tiene más de ${String(error.max)} columnas.`,
} satisfies ErrorMessages<PreviewClientImportError>;

export const START_IMPORT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para importar contactos o asignarlos a otro agente.',
  InvalidInput: 'Revisá el archivo y el mapeo de columnas, y probá de nuevo.',
  UnreadableSpreadsheet: UNREADABLE,
  EmptyImportFile: EMPTY_FILE,
  TooManyImportRows: TOO_MANY_ROWS,
  InvalidImportMapping: (error) =>
    ({
      missing_name: 'Elegí la columna del nombre o de la empresa.',
      missing_contact: 'Elegí al menos una columna de teléfono o de email.',
      unknown_column: 'Una de las columnas elegidas no está en el archivo.',
      repeated_column: 'Usaste la misma columna para dos datos.',
    })[error.reason],
  AgentNotFound: 'El agente elegido ya no está activo.',
} satisfies ErrorMessages<StartClientImportError>;

export const CLIENT_IMPORTS_ERROR_MESSAGES = {
  Forbidden: IMPORT_FORBIDDEN,
  InvalidInput: 'Los filtros no son válidos.',
} satisfies ErrorMessages<ListClientImportsError>;

export const CLIENT_IMPORT_ERROR_MESSAGES = {
  Forbidden: IMPORT_FORBIDDEN,
  InvalidInput: 'No encontramos la importación.',
  ClientImportNotFound: 'No encontramos la importación.',
} satisfies ErrorMessages<GetClientImportError>;

export const CLIENT_IMPORT_PROBLEMS_ERROR_MESSAGES = {
  Forbidden: IMPORT_FORBIDDEN,
  InvalidInput: 'No encontramos la importación.',
} satisfies ErrorMessages<ListClientImportProblemsError>;
