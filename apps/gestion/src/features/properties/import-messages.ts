import type {
  GetPropertyImportError,
  ListPropertyImportProblemsError,
  ListPropertyImportsError,
  PreviewPropertyImportError,
  StartPropertyImportError,
  StartTokkoApiPropertyImportError,
} from '@norde/core/properties';
import { MAX_PROPERTY_IMPORT_ROWS } from '@norde/core/properties/contracts';

import type { ErrorMessages } from '../../lib/errors';

// ---------- Importación de propiedades de Tokko ----------

const FORBIDDEN = 'No tenés permiso para importar propiedades.';
const UNREADABLE =
  'No pudimos leer el archivo. Subí la exportación de propiedades de Tokko (.csv) tal como sale.';
const NOT_TOKKO = (error: { readonly missing: readonly string[] }) =>
  `No parece la exportación de propiedades de Tokko: faltan las columnas ${error.missing.join(', ')}.`;
const EMPTY_FILE = 'El archivo no tiene propiedades.';
const TOO_MANY_ROWS = `El archivo tiene más de ${MAX_PROPERTY_IMPORT_ROWS.toLocaleString('es-AR')} filas.`;

export const PREVIEW_PROPERTY_IMPORT_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: 'Subí la exportación de Tokko (.csv) de hasta 5 MB.',
  UnreadableSpreadsheet: UNREADABLE,
  NotATokkoExport: NOT_TOKKO,
  EmptyImportFile: EMPTY_FILE,
  TooManyImportRows: TOO_MANY_ROWS,
} satisfies ErrorMessages<PreviewPropertyImportError>;

export const START_PROPERTY_IMPORT_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: 'Revisá el archivo y probá de nuevo.',
  UnreadableSpreadsheet: UNREADABLE,
  NotATokkoExport: NOT_TOKKO,
  EmptyImportFile: EMPTY_FILE,
  TooManyImportRows: TOO_MANY_ROWS,
} satisfies ErrorMessages<StartPropertyImportError>;

export const START_TOKKO_API_IMPORT_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  TokkoApiNotConfigured: 'Falta configurar la API key de Tokko.',
  ImportInProgress: 'Ya se están trayendo las propiedades de Tokko. Esperá a que termine.',
} satisfies ErrorMessages<StartTokkoApiPropertyImportError>;

export const PROPERTY_IMPORTS_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: 'Los filtros no son válidos.',
} satisfies ErrorMessages<ListPropertyImportsError>;

export const PROPERTY_IMPORT_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: 'No encontramos la importación.',
  PropertyImportNotFound: 'No encontramos la importación.',
} satisfies ErrorMessages<GetPropertyImportError>;

export const PROPERTY_IMPORT_PROBLEMS_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: 'No encontramos la importación.',
} satisfies ErrorMessages<ListPropertyImportProblemsError>;
