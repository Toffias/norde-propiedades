// El historial de un usuario (Mi cuenta): todo lo que hizo, agrupado por áreas para filtrarlo. Se lee
// de `audit_log` por autor; ningún módulo lo escribe aparte.

/** Áreas del filtro, en el orden del selector. `other` junta todo lo que no entra en otra. */
export const ACTIVITY_AREAS = [
  'properties',
  'developments',
  'clients',
  'opportunities',
  'appraisals',
  'users',
  'other',
] as const;
export type ActivityArea = (typeof ACTIVITY_AREAS)[number];

/** Tipos de entidad de cada área (salvo `other`, que es "ninguno de estos"). */
export const ACTIVITY_AREA_ENTITY_TYPES: Readonly<
  Record<Exclude<ActivityArea, 'other'>, readonly string[]>
> = {
  properties: ['property', 'property_export', 'property_import', 'reservation_export'],
  developments: ['development'],
  clients: ['client', 'client_export', 'client_import', 'conversation', 'inquiry'],
  opportunities: ['opportunity', 'opportunity_bulk_operation'],
  appraisals: ['appraisal', 'appraisal_export'],
  users: ['user', 'user_import'],
};

/** Filtro por tipo de entidad de un área: los de la lista, o todos menos los de la lista. */
export type ActivityEntityTypeFilter =
  { readonly include: readonly string[] } | { readonly exclude: readonly string[] };

export function activityEntityTypes(area: ActivityArea): ActivityEntityTypeFilter {
  if (area === 'other') return { exclude: Object.values(ACTIVITY_AREA_ENTITY_TYPES).flat() };
  return { include: ACTIVITY_AREA_ENTITY_TYPES[area] };
}

export function activityAreaOf(entityType: string): ActivityArea {
  return (
    ACTIVITY_AREAS.find(
      (area) => area !== 'other' && ACTIVITY_AREA_ENTITY_TYPES[area].includes(entityType),
    ) ?? 'other'
  );
}
