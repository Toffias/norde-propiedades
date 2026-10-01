import type { ChangeFavoritesError } from '@norde/core/identity';
import type {
  BulkEditPropertiesError,
  ComparePropertiesError,
  CreateFeatureError,
  CreateLocationError,
  CreatePropertyError,
  CreateTagError,
  CreateTagGroupError,
  DeleteFavoriteSearchError,
  DeletePropertyError,
  DeleteTagError,
  DeleteTagGroupError,
  ExportPropertiesError,
  GetPropertyMapError,
  ListPanelPropertiesError,
  RenameLocationError,
  RenameTagGroupError,
  RestorePropertyError,
  SaveFavoriteSearchError,
  UpdateFeatureError,
  UpdateGridColumnsError,
  UpdatePropertyTypeSettingError,
  UpdateTagError,
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
  LocationNotFound: 'No encontramos esa ubicación. Elegila de nuevo en el buscador.',
  PropertyTypeDisabled:
    'Ese tipo de propiedad está deshabilitado en Mi empresa → Propiedades. Elegí otro o habilitalo.',
} satisfies ErrorMessages<CreatePropertyError | DeletePropertyError | RestorePropertyError>;

export const PROPERTY_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver estas propiedades.',
  InvalidSearch: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  NoBranchAssigned: 'No tenés una sucursal asignada: elegí "Todas" o "Mis captaciones".',
} satisfies ErrorMessages<ListPanelPropertiesError>;

export const COMPARE_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver estas propiedades.',
  InvalidSearch: 'Elegí de 2 a 4 propiedades en el buscador para compararlas.',
} satisfies ErrorMessages<ComparePropertiesError>;

export const PROPERTY_MAP_ERROR_MESSAGES = {
  ...PROPERTY_LIST_ERROR_MESSAGES,
  InvalidSearch: 'No pudimos ubicar el área del mapa. Movelo un poco y probá de nuevo.',
} satisfies ErrorMessages<GetPropertyMapError>;

export const BULK_EDIT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para hacer este cambio masivo.',
  InvalidInput: 'Revisá el cambio elegido y probá de nuevo.',
  NoBranchAssigned: PROPERTY_LIST_ERROR_MESSAGES.NoBranchAssigned,
  TagNotFound: 'Alguna de las etiquetas ya no existe. Elegilas de nuevo.',
  ProducerNotFound: 'Ese usuario no existe o está suspendido: no puede ser captador.',
  TooManyProperties: (error) =>
    `Son ${error.total} propiedades: se editan hasta ${error.max} a la vez. Filtrá un poco más.`,
} satisfies ErrorMessages<BulkEditPropertiesError>;

export const EXPORT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para exportar esta cantidad de propiedades.',
  InvalidInput: 'No pudimos armar la exportación. Probá de nuevo.',
  NoBranchAssigned: PROPERTY_LIST_ERROR_MESSAGES.NoBranchAssigned,
  NothingToExport: 'No hay propiedades para exportar con esta selección.',
  TooManyToExport: (error) =>
    `Son ${error.total} propiedades y este formato admite hasta ${error.max}. Filtrá un poco más.`,
} satisfies ErrorMessages<ExportPropertiesError>;

export const FAVORITE_ERROR_MESSAGES = {
  Forbidden: 'Solo un usuario del panel tiene favoritos.',
  InvalidInput: 'Elegí al menos una propiedad (hasta una página).',
} satisfies ErrorMessages<ChangeFavoritesError>;

export const FAVORITE_SEARCH_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para guardar búsquedas.',
  InvalidInput: 'Escribí un nombre para la búsqueda y revisá los filtros.',
  TooManyFavoriteSearches: (error) =>
    `Ya tenés ${error.max} búsquedas favoritas. Borrá alguna para guardar otra.`,
  FavoriteSearchNotFound: 'Esa búsqueda ya no existe.',
} satisfies ErrorMessages<SaveFavoriteSearchError | DeleteFavoriteSearchError>;

/** Errores de los commands de catálogos y configuración (Mi empresa). */
export type CatalogError =
  | CreateLocationError
  | RenameLocationError
  | CreateFeatureError
  | UpdateFeatureError
  | CreateTagGroupError
  | RenameTagGroupError
  | DeleteTagGroupError
  | CreateTagError
  | UpdateTagError
  | DeleteTagError
  | UpdatePropertyTypeSettingError
  | UpdateGridColumnsError;

export const CATALOG_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para cambiar esta configuración.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  LocationNotFound: 'No encontramos esa ubicación. Puede que la hayan cambiado.',
  LocationNameTaken: 'Ya hay una ubicación con ese nombre en el mismo lugar.',
  LocationTooDeep: 'Un subbarrio no tiene ubicaciones adentro.',
  FeatureNotFound: 'No encontramos ese ítem del catálogo.',
  FeatureNameTaken: 'Ya hay un ítem con ese nombre.',
  TagGroupNotFound: 'No encontramos ese grupo de etiquetas.',
  TagGroupNameTaken: 'Ya hay un grupo con ese nombre.',
  TagGroupNotEmpty: 'El grupo tiene etiquetas: movelas o borralas antes de borrarlo.',
  TagNotFound: 'No encontramos esa etiqueta.',
  TagNameTaken: 'Ya hay una etiqueta con ese nombre en ese grupo.',
  TagInUse: (error) =>
    `La usan ${error.uses} propiedades o emprendimientos. Quitásela antes de borrarla.`,
  NoPropertyTypeEnabled: 'La inmobiliaria trabaja con al menos un tipo de propiedad.',
  TooManyGridColumns: (error) => `Elegí hasta ${error.max} columnas.`,
} satisfies ErrorMessages<CatalogError>;
