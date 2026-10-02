import type {
  ChangeOpportunityStageError,
  CloseOpportunityError,
  CountOpportunitiesByStageError,
  ListOpportunitiesError,
  ListOpportunityHistoryError,
  BulkUpdateOpportunitiesError,
  GetOpportunityBulkOperationError,
  UpdateOpportunityReferralError,
  ReassignOpportunityError,
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

// ---------- Pipeline (etapa 2) ----------

const NOT_VISIBLE = 'No tenés permiso para ver oportunidades.';
const CANT_UPDATE = 'No podés cambiar esta oportunidad: es de otro agente.';
const OPPORTUNITY_NOT_FOUND = 'No encontramos la oportunidad. Recargá la página.';
const CLOSED = 'La oportunidad ya está cerrada.';

export const LIST_OPPORTUNITIES_ERROR_MESSAGES = {
  Forbidden: NOT_VISIBLE,
  InvalidInput: 'Algún filtro no es válido. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListOpportunitiesError | CountOpportunitiesByStageError>;

export const LIST_OPPORTUNITY_HISTORY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver esta oportunidad.',
  InvalidInput: OPPORTUNITY_NOT_FOUND,
  OpportunityNotFound: OPPORTUNITY_NOT_FOUND,
} satisfies ErrorMessages<ListOpportunityHistoryError>;

export const CHANGE_STAGE_ERROR_MESSAGES = {
  Forbidden: CANT_UPDATE,
  InvalidInput: OPPORTUNITY_NOT_FOUND,
  OpportunityNotFound: OPPORTUNITY_NOT_FOUND,
  StageNotFound: STAGE_NOT_FOUND,
  OpportunityClosed: CLOSED,
  StageInactive: 'Ese estado está desactivado. Elegí otro.',
  CloseRequiresReason: 'Para pasarla a ganada o perdida, cerrala con un motivo.',
  InvalidStatusTransition: ({ from, to }) =>
    `No se puede pasar de "${OPPORTUNITY_STATUS_LABELS[from]}" a "${OPPORTUNITY_STATUS_LABELS[to]}".`,
} satisfies ErrorMessages<ChangeOpportunityStageError>;

export const CLOSE_OPPORTUNITY_ERROR_MESSAGES = {
  Forbidden: CANT_UPDATE,
  InvalidInput: 'Elegí un motivo de cierre.',
  OpportunityNotFound: OPPORTUNITY_NOT_FOUND,
  CloseReasonNotFound: REASON_NOT_FOUND,
  StageNotFound: 'No hay un estado activo para cerrarla con ese motivo. Revisá la configuración.',
  OpportunityClosed: CLOSED,
  StageInactive: 'Ese estado está desactivado. Elegí otro.',
  CloseReasonInactive: 'Ese motivo está desactivado. Elegí otro.',
  CloseStageMismatch: 'El estado elegido no corresponde al motivo (ganada o perdida).',
  InvalidStatusTransition: ({ from, to }) =>
    `No se puede pasar de "${OPPORTUNITY_STATUS_LABELS[from]}" a "${OPPORTUNITY_STATUS_LABELS[to]}".`,
} satisfies ErrorMessages<CloseOpportunityError>;

export const REASSIGN_OPPORTUNITY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para reasignar esta oportunidad.',
  InvalidInput: OPPORTUNITY_NOT_FOUND,
  OpportunityNotFound: OPPORTUNITY_NOT_FOUND,
  OpportunityClosed: 'Una oportunidad cerrada no se reasigna.',
  AgentNotFound: 'El agente elegido no existe o no está activo.',
} satisfies ErrorMessages<ReassignOpportunityError>;

export const BULK_UPDATE_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para hacer este cambio masivo.',
  InvalidInput: 'Revisá la acción elegida y probá de nuevo.',
  StageNotFound: STAGE_NOT_FOUND,
  StageInactive: 'Ese estado está desactivado. Elegí otro.',
  CloseRequiresReason: 'Para pasarlas a ganada o perdida, cerralas con un motivo.',
  CloseReasonNotFound: REASON_NOT_FOUND,
  CloseReasonInactive: 'Ese motivo está desactivado. Elegí otro.',
  AgentNotFound: 'El agente elegido no existe o no está activo.',
  TooManyOpportunities: (error) =>
    `Son ${error.total.toLocaleString('es-AR')} oportunidades: se cambian hasta ${error.max.toLocaleString('es-AR')} a la vez. Filtrá un poco más.`,
} satisfies ErrorMessages<BulkUpdateOpportunitiesError>;

export const GET_BULK_OPERATION_ERROR_MESSAGES = {
  Forbidden: NOT_VISIBLE,
  InvalidInput: 'No encontramos el cambio masivo.',
  BulkOperationNotFound: 'No encontramos el cambio masivo.',
} satisfies ErrorMessages<GetOpportunityBulkOperationError>;

export const UPDATE_REFERRAL_ERROR_MESSAGES = {
  Forbidden: CANT_UPDATE,
  InvalidInput: 'Revisá los datos de la derivación.',
  OpportunityNotFound: OPPORTUNITY_NOT_FOUND,
  OpportunityNotReferred: 'Solo se cargan mientras está en "Aplica a otra inmobiliaria".',
} satisfies ErrorMessages<UpdateOpportunityReferralError>;
