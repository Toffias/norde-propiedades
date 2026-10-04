'use client';

import type { HistoryEntryRow } from '@norde/core/audit/contracts';
import type { Page } from '@norde/core/shared';

import { AuditHistoryGrid, type HistoryFormat } from '../../shared/components/audit-history-grid';
import { appraisalFieldLabel, formatAppraisalValue } from '../history-format';
import { APPRAISAL_HISTORY_ACTION_LABELS } from '../labels';

const FORMAT: HistoryFormat = {
  actionLabels: APPRAISAL_HISTORY_ACTION_LABELS,
  fieldLabel: appraisalFieldLabel,
  formatValue: formatAppraisalValue,
};

/** La pestaña Historial de la tasación: quién cambió qué y cuándo. */
export function AppraisalHistoryGrid({
  page,
  from,
  to,
}: {
  readonly page: Page<HistoryEntryRow>;
  readonly from: string | undefined;
  readonly to: string | undefined;
}) {
  return (
    <AuditHistoryGrid
      label="Historial de la tasación"
      page={page}
      categories={[]}
      category={undefined}
      from={from}
      to={to}
      format={FORMAT}
    />
  );
}
