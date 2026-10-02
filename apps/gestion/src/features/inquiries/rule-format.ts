import {
  CONTACT_CHANNEL_LABELS,
  type InquiryRuleConditionsView,
} from '@norde/core/clients/contracts';

import { OPERATION_LABELS, PROPERTY_TYPE_LABELS } from '../properties/labels';

// Cómo se muestran en el panel las reglas de asignación de consultas.

export interface ConditionLine {
  readonly label: string;
  readonly values: readonly string[];
}

const label = (labels: Readonly<Record<string, string>>) => (value: string) =>
  labels[value] ?? value;

/**
 * Las condiciones de una regla en palabras, una línea por condición que tiene valores. Sin ninguna,
 * la regla toma cualquier consulta.
 */
export function conditionLines(conditions: InquiryRuleConditionsView): ConditionLine[] {
  const lines: ConditionLine[] = [
    { label: 'Canal', values: conditions.channels.map(label(CONTACT_CHANNEL_LABELS)) },
    { label: 'Operación', values: conditions.operations.map(label(OPERATION_LABELS)) },
    { label: 'Tipo', values: conditions.propertyTypes.map(label(PROPERTY_TYPE_LABELS)) },
    { label: 'Zona', values: [...conditions.neighborhoods] },
    {
      label: 'Propiedad',
      values: conditions.properties.map((p) =>
        p.summary === undefined ? 'Ya no está en la cartera' : p.summary.code,
      ),
    },
    {
      label: 'Emprendimiento',
      values:
        conditions.developmentIds.length === 0
          ? []
          : [`${String(conditions.developmentIds.length)} elegidos`],
    },
  ];
  return lines.filter((line) => line.values.length > 0);
}

/** Qué parte de las consultas recibe cada agente, en %, con los pesos que se están cargando. */
export function weightShares(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (total === 0 ? 0 : Math.round((w / total) * 100)));
}
