import type {
  CreateCloseReasonError,
  CreateOpportunityStageError,
  DeactivateCloseReasonError,
  DeactivateOpportunityStageError,
  ReactivateCloseReasonError,
  ReactivateOpportunityStageError,
  ReorderCloseReasonsError,
  ReorderOpportunityStagesError,
  UpdateCloseReasonError,
  UpdateOpportunitySettingsError,
  UpdateOpportunityStageError,
} from '@norde/core/clients';
import { OPPORTUNITY_STATUS_LABELS } from '@norde/core/clients/contracts';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de la configuración de oportunidades → mensajes para el usuario.

const FORBIDDEN = 'No tenés permiso para cambiar la configuración de oportunidades.';
const INVALID = 'Revisá los datos marcados y probá de nuevo.';
const STAGE_NOT_FOUND = 'No encontramos el estado. Recargá la página.';
const REASON_NOT_FOUND = 'No encontramos el motivo. Recargá la página.';
const STALE_ORDER = 'La lista cambió mientras la ordenabas. Recargá la página y probá de nuevo.';

export const CREATE_STAGE_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  TooManyStages: ({ max }) => `Podés tener hasta ${max} estados.`,
} satisfies ErrorMessages<CreateOpportunityStageError>;

export const UPDATE_STAGE_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  StageNotFound: STAGE_NOT_FOUND,
} satisfies ErrorMessages<UpdateOpportunityStageError>;

export const REORDER_STAGES_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: STALE_ORDER,
  InvalidOrder: STALE_ORDER,
} satisfies ErrorMessages<ReorderOpportunityStagesError>;

export const DEACTIVATE_STAGE_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: STAGE_NOT_FOUND,
  StageNotFound: STAGE_NOT_FOUND,
  LastActiveStage: ({ category }) =>
    `Es el único estado activo de "${OPPORTUNITY_STATUS_LABELS[category]}": creá o activá otro antes de desactivarlo.`,
  StageUsedByRule: 'Una regla automática usa este estado. Cambiá la regla antes de desactivarlo.',
} satisfies ErrorMessages<DeactivateOpportunityStageError>;

export const REACTIVATE_STAGE_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: STAGE_NOT_FOUND,
  StageNotFound: STAGE_NOT_FOUND,
} satisfies ErrorMessages<ReactivateOpportunityStageError>;

export const CREATE_REASON_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  TooManyCloseReasons: ({ max }) => `Podés tener hasta ${max} motivos de cierre.`,
} satisfies ErrorMessages<CreateCloseReasonError>;

export const UPDATE_REASON_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  CloseReasonNotFound: REASON_NOT_FOUND,
} satisfies ErrorMessages<UpdateCloseReasonError>;

export const REORDER_REASONS_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: STALE_ORDER,
  InvalidOrder: STALE_ORDER,
} satisfies ErrorMessages<ReorderCloseReasonsError>;

export const DEACTIVATE_REASON_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: REASON_NOT_FOUND,
  CloseReasonNotFound: REASON_NOT_FOUND,
  LastActiveCloseReason: 'Tiene que quedar al menos un motivo activo para poder cerrar.',
} satisfies ErrorMessages<DeactivateCloseReasonError>;

export const REACTIVATE_REASON_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: REASON_NOT_FOUND,
  CloseReasonNotFound: REASON_NOT_FOUND,
} satisfies ErrorMessages<ReactivateCloseReasonError>;

export const UPDATE_RULES_ERROR_MESSAGES = {
  Forbidden: FORBIDDEN,
  InvalidInput: INVALID,
  InvalidRuleStage:
    'Elegí un estado activo de una categoría abierta. Al crear no puede ser "Aplica a otra inmobiliaria".',
} satisfies ErrorMessages<UpdateOpportunitySettingsError>;
