'use client';

import {
  PROPERTY_HISTORY_CATEGORY_VALUES,
  type PropertyHistoryCategory,
} from '@norde/core/properties/contracts';
import type { HistoryEntryRow } from '@norde/core/audit/contracts';
import type { Page } from '@norde/core/shared';

import {
  AuditHistoryGrid,
  type HistoryFormat,
} from '../../../shared/components/audit-history-grid';
import { HISTORY_ACTION_LABELS, HISTORY_CATEGORY_LABELS } from '../../detail-labels';
import { formatHistoryValue, historyFieldLabel } from '../../history-format';

const CATEGORIES = PROPERTY_HISTORY_CATEGORY_VALUES.map((value) => ({
  value,
  label: HISTORY_CATEGORY_LABELS[value],
}));

const FORMAT: HistoryFormat = {
  actionLabels: HISTORY_ACTION_LABELS,
  fieldLabel: historyFieldLabel,
  formatValue: formatHistoryValue,
};

/** La pestaña Historial de la propiedad. */
export function HistoryGrid({
  page,
  category,
  from,
  to,
}: {
  readonly page: Page<HistoryEntryRow>;
  readonly category: PropertyHistoryCategory | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
}) {
  return (
    <AuditHistoryGrid
      label="Historial de la propiedad"
      page={page}
      categories={CATEGORIES}
      category={category}
      from={from}
      to={to}
      format={FORMAT}
    />
  );
}
