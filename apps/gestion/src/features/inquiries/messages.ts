import type {
  AssignInquiryError,
  CreateInquiryRuleError,
  DeleteInquiryRuleError,
  GetInquiryRuleError,
  ListInquiryRulesError,
  MoveInquiryRuleError,
  SetInquiryRuleActiveError,
  UpdateInquiryRuleError,
  DeleteInquiryError,
  ListInquiriesError,
  ListInquiryMatchesError,
  RestoreInquiryError,
} from '@norde/core/clients';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de la bandeja de consultas → mensajes para el usuario.

const INVALID = 'Revisá los datos y probá de nuevo.';
const NOT_FOUND = 'No encontramos la consulta. Puede que la hayan borrado.';

export const INQUIRY_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las consultas.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListInquiriesError>;

export const DELETE_INQUIRY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para borrar consultas.',
  InvalidInput: INVALID,
  InquiryNotFound: NOT_FOUND,
  InquiryAlreadyDeleted: 'La consulta ya estaba en Borradas.',
} satisfies ErrorMessages<DeleteInquiryError>;

export const RESTORE_INQUIRY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para restaurar consultas.',
  InvalidInput: INVALID,
  InquiryNotFound: NOT_FOUND,
  InquiryNotDeleted: 'La consulta ya no está en Borradas.',
} satisfies ErrorMessages<RestoreInquiryError>;

export const INQUIRY_MATCHES_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para asignar consultas.',
  InvalidInput: INVALID,
  InquiryNotFound: NOT_FOUND,
} satisfies ErrorMessages<ListInquiryMatchesError>;

export const ASSIGN_INQUIRY_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para asignar consultas.',
  InvalidInput: INVALID,
  InquiryNotFound: NOT_FOUND,
  InquiryAlreadyAssigned: 'La consulta ya estaba asignada.',
  InquiryInTrash: 'La consulta está en Borradas: restaurala para asignarla.',
  InquiryClientMismatch: 'Ese contacto ya no comparte el teléfono ni el email de la consulta.',
  DuplicateClient: 'Ya hay un contacto con este teléfono o email: asignale la consulta a él.',
  AgentNotFound: 'El agente elegido no existe o no está activo.',
} satisfies ErrorMessages<AssignInquiryError>;

// ---------- Reglas de asignación ----------

const RULES_FORBIDDEN = 'No tenés permiso para administrar las reglas de asignación.';
const RULE_NOT_FOUND = 'No encontramos la regla. Puede que la hayan borrado.';

/** Lo que el dominio no acepta de una regla, por motivo. */
const INVALID_RULE: Readonly<Record<string, string>> = {
  name: 'Ingresá un nombre de hasta 80 caracteres.',
  no_agents: 'Elegí al menos un agente.',
  too_many_agents: 'Una regla puede repartir entre 20 agentes como máximo.',
  duplicate_agent: 'Cada agente puede estar una sola vez en la regla.',
  weight: 'El peso de cada agente va de 1 a 10.',
  too_many_values: 'Cada condición admite hasta 50 valores.',
};

function invalidRuleMessage(reason: string): string {
  return INVALID_RULE[reason] ?? INVALID;
}

export const LIST_INQUIRY_RULES_ERROR_MESSAGES = {
  Forbidden: RULES_FORBIDDEN,
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
} satisfies ErrorMessages<ListInquiryRulesError>;

export const GET_INQUIRY_RULE_ERROR_MESSAGES = {
  Forbidden: RULES_FORBIDDEN,
  InvalidInput: INVALID,
  InquiryRuleNotFound: RULE_NOT_FOUND,
} satisfies ErrorMessages<GetInquiryRuleError>;

export const CREATE_INQUIRY_RULE_ERROR_MESSAGES = {
  Forbidden: RULES_FORBIDDEN,
  InvalidInput: INVALID,
  InvalidInquiryRule: (error) => invalidRuleMessage(error.reason),
  TooManyInquiryRules: 'Ya hay 100 reglas, el máximo. Borrá alguna que no uses.',
  AgentNotFound: 'Alguno de los agentes no existe o no está activo.',
} satisfies ErrorMessages<CreateInquiryRuleError>;

export const UPDATE_INQUIRY_RULE_ERROR_MESSAGES = {
  Forbidden: RULES_FORBIDDEN,
  InvalidInput: INVALID,
  InquiryRuleNotFound: RULE_NOT_FOUND,
  InvalidInquiryRule: (error) => invalidRuleMessage(error.reason),
  AgentNotFound: 'Alguno de los agentes no existe o no está activo.',
} satisfies ErrorMessages<UpdateInquiryRuleError>;

export const SET_INQUIRY_RULE_ACTIVE_ERROR_MESSAGES = {
  Forbidden: RULES_FORBIDDEN,
  InvalidInput: INVALID,
  InquiryRuleNotFound: RULE_NOT_FOUND,
} satisfies ErrorMessages<SetInquiryRuleActiveError>;

export const MOVE_INQUIRY_RULE_ERROR_MESSAGES = {
  Forbidden: RULES_FORBIDDEN,
  InvalidInput: INVALID,
  InquiryRuleNotFound: RULE_NOT_FOUND,
} satisfies ErrorMessages<MoveInquiryRuleError>;

export const DELETE_INQUIRY_RULE_ERROR_MESSAGES = {
  Forbidden: RULES_FORBIDDEN,
  InvalidInput: INVALID,
  InquiryRuleNotFound: RULE_NOT_FOUND,
} satisfies ErrorMessages<DeleteInquiryRuleError>;
