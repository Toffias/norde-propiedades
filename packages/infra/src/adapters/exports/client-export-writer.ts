import { PassThrough } from 'node:stream';

import {
  CLIENT_KIND_LABELS,
  CLIENT_TYPE_LABELS,
  type ClientExportFile,
  type ClientExportWriter,
  type ClientListRow,
} from '@norde/core/clients';
import ExcelJS from 'exceljs';

// Planilla de Excel de una exportación de contactos. Se arma a medida que llegan los lotes; nunca
// tiene la exportación entera en memoria.

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

type Cell = string | undefined;

interface Column {
  readonly header: string;
  readonly width: number;
  readonly value: (row: ClientListRow) => Cell;
}

const COLUMNS: readonly Column[] = [
  { header: 'Nombre', width: 30, value: (r) => r.name },
  { header: 'Tipo de registro', width: 18, value: (r) => CLIENT_KIND_LABELS[r.kind] },
  { header: 'Empresa', width: 24, value: (r) => r.companyName },
  { header: 'Teléfono', width: 18, value: (r) => r.phone },
  { header: 'Celular', width: 18, value: (r) => r.mobile },
  { header: 'Email', width: 30, value: (r) => r.email },
  {
    header: 'Tipos de cliente',
    width: 30,
    value: (r) => r.clientTypes.map((type) => CLIENT_TYPE_LABELS[type]).join(', ') || undefined,
  },
  { header: 'Agente', width: 22, value: (r) => r.agent?.name },
  { header: 'Creación', width: 12, value: (r) => dateFormat.format(r.createdAt) },
  { header: 'Última actualización', width: 12, value: (r) => dateFormat.format(r.updatedAt) },
];

/** Excel con exceljs, en streaming. */
export class XlsxClientExportWriter implements ClientExportWriter {
  write(
    batches: AsyncIterable<readonly ClientListRow[]>,
    meta: { readonly generatedAt: Date },
  ): ClientExportFile {
    const day = meta.generatedAt.toISOString().slice(0, 10);
    return {
      filename: `contactos-${day}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: xlsx(batches),
    };
  }
}

function xlsx(batches: AsyncIterable<readonly ClientListRow[]>): AsyncIterable<Uint8Array> {
  const stream = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const sheet = workbook.addWorksheet('Contactos', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c, index) => ({
    header: c.header,
    key: String(index),
    width: c.width,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).commit();

  void (async () => {
    try {
      for await (const batch of batches) {
        for (const row of batch) {
          sheet.addRow(COLUMNS.map((c) => c.value(row) ?? null)).commit();
        }
      }
      sheet.commit();
      await workbook.commit();
    } catch (error) {
      // El error llega a quien lee el archivo: la descarga se corta en vez de quedar incompleta.
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  })();
  return stream;
}
