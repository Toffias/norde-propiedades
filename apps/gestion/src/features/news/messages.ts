import type { ListNewsError } from '@norde/core/audit';

import type { ErrorMessages } from '../../lib/errors';

export const NEWS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las noticias.',
  InvalidInput: 'No pudimos cargar las noticias. Recargá la página y probá de nuevo.',
} satisfies ErrorMessages<ListNewsError>;
