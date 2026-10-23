import type {
  GetPublicationOverviewError,
  ListPortalPublicationsError,
} from '@norde/core/reporting';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de Difusión (#114) → mensajes para la UI.

const FORBIDDEN = 'No tenés permiso para ver la difusión en portales.';

export const PUBLICATION_OVERVIEW_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
} satisfies ErrorMessages<GetPublicationOverviewError>;

export const PORTAL_PUBLICATIONS_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: 'El filtro de la dirección no es válido.',
  PortalKindNotPublished: 'Esa cuenta no publica ese tipo de aviso.',
} satisfies ErrorMessages<ListPortalPublicationsError>;
