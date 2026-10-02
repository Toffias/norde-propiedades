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
  ExportClientsError,
  FeaturePropertiesError,
  GetClientDetailError,
  GetFeaturedPropertyIdsError,
  LinkClientsError,
  ListClientActivityError,
  ListClientFeaturedError,
  ListClientHistoryError,
  ListClientLettersError,
  ListClientOpportunitiesError,
  ListClientRelationsError,
  ListClientSavedSearchesError,
  ListClientsError,
  ListClientTagGroupsError,
  MergeClientsError,
  MergeClientTagsError,
  PreviewClientMergeError,
  ReassignClientError,
  RenameClientTagGroupError,
  RestoreClientError,
  SearchClientTagsError,
  UnfeaturePropertyError,
  UnlinkClientsError,
  UpdateClientDetailsError,
  UpdateClientTagError,
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

export const CLIENT_FAVORITE_ERROR_MESSAGES = {
  Forbidden: 'Solo un usuario del panel tiene favoritos.',
  InvalidInput: INVALID,
} satisfies ErrorMessages<ChangeFavoritesError>;
