import type { ConstructionStatusValue, DevelopmentType } from '@norde/core/properties/contracts';

// Cómo se muestran en el sitio los valores de los emprendimientos (los mismos textos que el panel).

export const DEVELOPMENT_TYPE_LABELS: Readonly<Record<DevelopmentType, string>> = {
  building: 'Edificio',
  gated_community: 'Barrio cerrado',
  housing_complex: 'Complejo de viviendas',
  office_building: 'Edificio de oficinas',
  lots: 'Loteo',
  other: 'Otro',
};

export const CONSTRUCTION_STATUS_LABELS: Readonly<Record<ConstructionStatusValue, string>> = {
  pre_sale: 'En pozo',
  under_construction: 'En construcción',
  finished: 'Terminado',
};
