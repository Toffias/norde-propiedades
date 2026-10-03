'use client';

import type { HistoryEntryRow } from '@norde/core/audit/contracts';
import {
  DEVELOPMENT_HISTORY_CATEGORY_VALUES,
  type DevelopmentHistoryCategory,
} from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';

import { AuditHistoryGrid, type HistoryFormat } from '../../shared/components/audit-history-grid';
import { developmentFieldLabel, formatDevelopmentValue } from '../history-format';
import { DEVELOPMENT_HISTORY_ACTION_LABELS, DEVELOPMENT_HISTORY_CATEGORY_LABELS } from '../labels';

const CATEGORIES = DEVELOPMENT_HISTORY_CATEGORY_VALUES.map((value) => ({
  value,
  label: DEVELOPMENT_HISTORY_CATEGORY_LABELS[value],
}));

const FORMAT: HistoryFormat = {
  actionLabels: DEVELOPMENT_HISTORY_ACTION_LABELS,
  fieldLabel: developmentFieldLabel,
  formatValue: formatDevelopmentValue,
};

/** La pestaña Historial del emprendimiento (la "Actividad" de Tokko). */
export function DevelopmentHistoryGrid({
  page,
  category,
  from,
  to,
}: {
  readonly page: Page<HistoryEntryRow>;
  readonly category: DevelopmentHistoryCategory | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
}) {
  return (
    <AuditHistoryGrid
      label="Historial del emprendimiento"
      page={page}
      categories={CATEGORIES}
      category={category}
      from={from}
      to={to}
      format={FORMAT}
    />
  );
}
