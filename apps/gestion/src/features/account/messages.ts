import type { ListMyActivityError } from '@norde/core/audit';

import type { ErrorMessages } from '../../lib/errors';

export const ACCOUNT_ACTIVITY_ERROR_MESSAGES = {
  Forbidden: 'Tu cuenta no tiene historial para mostrar.',
  InvalidInput: 'No pudimos cargar tu historial. Recargá la página y probá de nuevo.',
} satisfies ErrorMessages<ListMyActivityError>;
