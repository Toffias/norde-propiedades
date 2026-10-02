// Replican `OPPORTUNITY_TYPES` y `OPPORTUNITY_INTENTS` del dominio. Van aparte para que los otros
// contracts del módulo los usen sin importar el barrel.

export const OPPORTUNITY_TYPE_VALUES = ['sale', 'rent', 'appraisal'] as const;
export type OpportunityTypeValue = (typeof OPPORTUNITY_TYPE_VALUES)[number];
export const OPPORTUNITY_INTENT_VALUES = ['info', 'contact', 'visit'] as const;
