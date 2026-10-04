// Estados de una tasación. Los contracts tienen la misma lista para los formularios (el dominio no
// importa contracts); un test verifica que coincidan.

/**
 * `requested`: solicitada. `visit_scheduled`: con la visita agendada. `appraised`: tasada.
 * `converted`: se convirtió en una propiedad de la cartera (captación). `discarded`: descartada.
 */
export const APPRAISAL_STATUSES = [
  'requested',
  'visit_scheduled',
  'appraised',
  'converted',
  'discarded',
] as const;
export type AppraisalStatus = (typeof APPRAISAL_STATUSES)[number];

/** Los que se eligen a mano: "Convertida" la marca la conversión en propiedad. */
export type ManualAppraisalStatus = Exclude<AppraisalStatus, 'converted'>;

/**
 * Una solicitada o con visita agendada avanza o se descarta; una tasada se convierte o se descarta;
 * una descartada se reabre como solicitada. Convertida es final.
 */
const TRANSITIONS: Readonly<Record<AppraisalStatus, readonly AppraisalStatus[]>> = {
  requested: ['visit_scheduled', 'appraised', 'discarded'],
  visit_scheduled: ['requested', 'appraised', 'discarded'],
  appraised: ['converted', 'discarded'],
  converted: [],
  discarded: ['requested'],
};

export function canAppraisalTransition(from: AppraisalStatus, to: AppraisalStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Cómo agrupa Tokko los estados en sus filtros: Pendiente (solicitada o con visita agendada),
 * Tasado, Caída (descartada) e Ingresada (convertida).
 */
export const APPRAISAL_STATUS_GROUPS = ['pending', 'appraised', 'discarded', 'converted'] as const;
export type AppraisalStatusGroup = (typeof APPRAISAL_STATUS_GROUPS)[number];

const GROUP_STATUSES: Readonly<Record<AppraisalStatusGroup, readonly AppraisalStatus[]>> = {
  pending: ['requested', 'visit_scheduled'],
  appraised: ['appraised'],
  discarded: ['discarded'],
  converted: ['converted'],
};

export function statusesOfGroup(group: AppraisalStatusGroup): readonly AppraisalStatus[] {
  return GROUP_STATUSES[group];
}
