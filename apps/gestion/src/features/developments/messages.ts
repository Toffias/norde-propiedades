import type { ChangeFavoritesError } from '@norde/core/identity';
import type {
  ChangeDevelopmentStatusError,
  ChangeDevelopmentTagsError,
  CreateDevelopmentError,
  CreateDevelopmentUnitError,
  DeleteDevelopmentError,
  ExportDevelopmentUnitsError,
  GetDevelopmentDetailError,
  GetDevelopmentUnitImportError,
  GetDevelopmentMapError,
  ListDevelopmentHistoryError,
  ListDevelopmentsError,
  ListDevelopmentUnitImportProblemsError,
  ListDevelopmentUnitImportsError,
  PreviewDevelopmentUnitImportError,
  RestoreDevelopmentError,
  StartDevelopmentUnitImportError,
  UpdateDevelopmentDetailsError,
  UpdateDevelopmentFeaturesError,
  UpdateDevelopmentGeneralError,
  UpdateDevelopmentLocationError,
} from '@norde/core/properties';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de los casos de uso de emprendimientos → mensajes para la UI.

const COMMON = {
  Forbidden: 'No tenés permiso para hacer esto con este emprendimiento.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  DevelopmentNotFound:
    'No encontramos ese emprendimiento. Puede que lo hayan borrado definitivamente.',
  DevelopmentInTrash: 'El emprendimiento está en la papelera: restauralo para editarlo.',
} as const;

export const DEVELOPMENT_ERROR_MESSAGES = {
  ...COMMON,
  InvalidCoordinates: 'La latitud o la longitud no son válidas.',
  LocationNotFound: 'No encontramos esa ubicación. Elegila de nuevo en el buscador.',
  ReferenceCodeUnavailable:
    'No pudimos asignarle un código de referencia. Revisá la numeración en Mi empresa → Códigos.',
  DevelopmentAlreadyDeleted: 'El emprendimiento ya estaba en la papelera.',
  DevelopmentNotDeleted: 'El emprendimiento no está en la papelera.',
  DevelopmentHasUnits: (error) =>
    error.units === 1
      ? 'Tiene 1 unidad activa: borrala antes de borrar el emprendimiento.'
      : `Tiene ${String(error.units)} unidades activas: borralas antes de borrar el emprendimiento.`,
  InvalidDevelopmentStatusTransition: 'No se puede pasar a ese estado.',
  FeatureNotFound: 'Uno de los ítems ya no está en el catálogo. Recargá la página.',
  TagNotFound: 'Una de las etiquetas ya no existe. Recargá la página.',
} satisfies ErrorMessages<
  | CreateDevelopmentError
  | DeleteDevelopmentError
  | RestoreDevelopmentError
  | UpdateDevelopmentGeneralError
  | UpdateDevelopmentLocationError
  | UpdateDevelopmentDetailsError
  | ChangeDevelopmentStatusError
  | UpdateDevelopmentFeaturesError
  | ChangeDevelopmentTagsError
>;

export const DEVELOPMENT_UNIT_ERROR_MESSAGES = {
  ...COMMON,
  Forbidden: 'Para sumar unidades necesitás poder crear propiedades y editar este emprendimiento.',
  PropertyTypeDisabled:
    'Ese tipo de propiedad está deshabilitado en Mi empresa → Propiedades. Elegí otro o habilitalo.',
  ReferenceCodeUnavailable:
    'No pudimos asignarle un código de referencia. Revisá la numeración en Mi empresa → Códigos.',
  NegativePrice: 'El precio no puede ser negativo.',
  InvalidOperations: 'La unidad tiene que tener una operación, sin repetir.',
  NegativeCharacteristic: 'Las superficies y los ambientes no pueden ser negativos.',
  CoveredExceedsTotal: 'La superficie cubierta no puede ser mayor que la total.',
} satisfies ErrorMessages<CreateDevelopmentUnitError>;

export const DEVELOPMENT_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver estos emprendimientos.',
  InvalidSearch: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListDevelopmentsError | GetDevelopmentMapError>;

export const DEVELOPMENT_FAVORITE_ERROR_MESSAGES = {
  Forbidden: 'Solo un usuario del panel tiene favoritos.',
  InvalidInput: 'No pudimos marcar ese emprendimiento. Recargá la página y probá de nuevo.',
} satisfies ErrorMessages<ChangeFavoritesError>;

export const DEVELOPMENT_READ_ERROR_MESSAGES = {
  ...COMMON,
  Forbidden: 'No tenés permiso para ver este emprendimiento.',
} satisfies ErrorMessages<GetDevelopmentDetailError | ListDevelopmentHistoryError>;

// ---------- Excel de unidades ----------

export const EXPORT_UNITS_ERROR_MESSAGES = {
  ...COMMON,
  Forbidden:
    'No tenés permiso para exportar las unidades. Más de 10 piden "Exportar más de 10 propiedades".',
  NothingToExport: 'El emprendimiento todavía no tiene unidades para exportar.',
  TooManyToExport: (error) =>
    `Son ${error.total.toLocaleString('es-AR')} unidades y la exportación admite hasta ${error.max.toLocaleString('es-AR')}.`,
} satisfies ErrorMessages<ExportDevelopmentUnitsError>;

const UNIT_IMPORT_FORBIDDEN =
  'Para importar unidades necesitás poder crear propiedades y editar este emprendimiento.';
const UNREADABLE =
  'No pudimos leer el archivo. Subí un Excel (.xlsx) con los encabezados en la primera fila.';
const EMPTY_FILE = 'El archivo no tiene filas con datos debajo de los encabezados.';
const TOO_MANY_ROWS = (error: { readonly max: number }) =>
  `El archivo tiene más de ${error.max.toLocaleString('es-AR')} filas. Partilo en varios archivos.`;

export const PREVIEW_UNIT_IMPORT_ERROR_MESSAGES = {
  ...COMMON,
  Forbidden: UNIT_IMPORT_FORBIDDEN,
  InvalidInput: 'Subí un Excel (.xlsx) de hasta 5 MB.',
  UnreadableSpreadsheet: UNREADABLE,
  EmptyImportFile: EMPTY_FILE,
  TooManyImportRows: TOO_MANY_ROWS,
  TooManyImportColumns: (error) => `El archivo tiene más de ${String(error.max)} columnas.`,
} satisfies ErrorMessages<PreviewDevelopmentUnitImportError>;

export const START_UNIT_IMPORT_ERROR_MESSAGES = {
  ...COMMON,
  Forbidden: UNIT_IMPORT_FORBIDDEN,
  InvalidInput: 'Revisá el archivo y el mapeo de columnas, y probá de nuevo.',
  DevelopmentInTrash: 'El emprendimiento está en la papelera: restauralo para importar unidades.',
  UnreadableSpreadsheet: UNREADABLE,
  EmptyImportFile: EMPTY_FILE,
  TooManyImportRows: TOO_MANY_ROWS,
  InvalidUnitImportMapping: (error) =>
    ({
      missing_unit: 'Elegí la columna de la unidad: es la que identifica cada fila.',
      unknown_column: 'Una de las columnas elegidas no está en el archivo.',
      repeated_column: 'Usaste la misma columna para dos datos.',
    })[error.reason],
} satisfies ErrorMessages<StartDevelopmentUnitImportError>;

export const UNIT_IMPORTS_ERROR_MESSAGES = {
  ...COMMON,
  Forbidden: UNIT_IMPORT_FORBIDDEN,
  InvalidInput: 'Los filtros no son válidos.',
} satisfies ErrorMessages<ListDevelopmentUnitImportsError>;

export const UNIT_IMPORT_ERROR_MESSAGES = {
  ...COMMON,
  Forbidden: UNIT_IMPORT_FORBIDDEN,
  InvalidInput: 'No encontramos la importación.',
  DevelopmentUnitImportNotFound: 'No encontramos la importación.',
} satisfies ErrorMessages<GetDevelopmentUnitImportError | ListDevelopmentUnitImportProblemsError>;
