// Catálogos fijos que la tasación comparte con las propiedades (a las que se convierte). El dominio
// no importa properties: los contracts usan las listas de properties y un test verifica que
// coincidan con estas.

export const APPRAISAL_PROPERTY_TYPES = [
  'apartment',
  'house',
  'ph',
  'land',
  'office',
  'commercial',
  'garage',
  'warehouse',
] as const;
export type AppraisalPropertyType = (typeof APPRAISAL_PROPERTY_TYPES)[number];

export const APPRAISAL_CONDITIONS = [
  'brand_new',
  'excellent',
  'very_good',
  'good',
  'fair',
  'to_renovate',
] as const;
export type AppraisalCondition = (typeof APPRAISAL_CONDITIONS)[number];

/** Por dónde entró: cargada en el panel, por el agente de IA o por el formulario de la web. */
export const APPRAISAL_SOURCES = ['manual', 'agent_ia', 'web'] as const;
export type AppraisalSource = (typeof APPRAISAL_SOURCES)[number];
