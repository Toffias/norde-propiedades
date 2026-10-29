import type { AppraisalExportFile, AppraisalExportWriter } from '@norde/core/appraisals';
import type {
  AppraisalExportRow,
  AppraisalStatusValue,
  AppraisalValueRangeDto,
} from '@norde/core/appraisals/contracts';
import { PROPERTY_KIND_LABELS } from '@norde/core/properties';

import { amount, day, isoDay, xlsxStream, type Column } from './spreadsheet';

// Excel del listado de tasaciones (`/tasaciones`): las columnas de Tokko más lo que Tokko no
// exporta, los valores tasados (mínimo y máximo de venta y de alquiler).

const STATUS_LABELS: Readonly<Record<AppraisalStatusValue, string>> = {
  requested: 'Solicitada',
  visit_scheduled: 'Visita agendada',
  appraised: 'Tasada',
  converted: 'Ingresada',
  discarded: 'Descartada',
};

function valueColumns(
  label: string,
  range: (row: AppraisalExportRow) => AppraisalValueRangeDto | undefined,
): readonly Column<AppraisalExportRow>[] {
  return [
    { header: `${label}: moneda`, width: 10, value: (r) => range(r)?.currency },
    { header: `${label}: desde`, width: 14, value: (r) => amount(range(r)?.minCents) },
    { header: `${label}: hasta`, width: 14, value: (r) => amount(range(r)?.maxCents) },
  ];
}

const COLUMNS: readonly Column<AppraisalExportRow>[] = [
  { header: 'Código', width: 11, value: (r) => r.code },
  { header: 'Estado', width: 15, value: (r) => STATUS_LABELS[r.status] },
  { header: 'Tipo', width: 14, value: (r) => PROPERTY_KIND_LABELS[r.propertyType] },
  { header: 'Dirección', width: 32, value: (r) => r.address },
  {
    header: 'Solicitante',
    width: 26,
    value: (r) => r.requester.name ?? 'Contacto en la papelera',
  },
  { header: 'Productor', width: 22, value: (r) => r.producer.name },
  { header: 'Tasador', width: 22, value: (r) => r.appraiser?.name },
  { header: 'Sucursal', width: 16, value: (r) => r.branch?.name },
  { header: 'Ambientes', width: 10, value: (r) => r.rooms },
  { header: 'Sup. total (m²)', width: 12, value: (r) => r.surfaceTotalM2 },
  { header: 'Sup. cubierta (m²)', width: 12, value: (r) => r.surfaceCoveredM2 },
  ...valueColumns('Venta', (r) => r.sale),
  ...valueColumns('Alquiler', (r) => r.rent),
  { header: 'Visita', width: 12, value: (r) => day(r.visitAt) },
  { header: 'Alta', width: 12, value: (r) => day(r.createdAt) },
  { header: 'Última modificación', width: 12, value: (r) => day(r.updatedAt) },
];

/** Excel con exceljs, en streaming. */
export class XlsxAppraisalExportWriter implements AppraisalExportWriter {
  write(
    batches: AsyncIterable<readonly AppraisalExportRow[]>,
    meta: { readonly generatedAt: Date },
  ): AppraisalExportFile {
    return {
      filename: `tasaciones-${isoDay.format(meta.generatedAt)}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: xlsxStream('Tasaciones', COLUMNS, batches),
    };
  }
}
