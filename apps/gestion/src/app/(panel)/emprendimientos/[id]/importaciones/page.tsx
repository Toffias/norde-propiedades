import { ListDevelopmentUnitImportsQuerySchema } from '@norde/core/properties/contracts';
import type { Actor } from '@norde/core/shared';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { ArrowLeftIcon, FileSpreadsheetIcon } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getContainer } from '../../../../../container';
import { UnitImportsGrid } from '../../../../../features/developments/components/unit-imports-grid';
import {
  DEVELOPMENT_READ_ERROR_MESSAGES,
  UNIT_IMPORT_ERROR_MESSAGES,
  UNIT_IMPORTS_ERROR_MESSAGES,
} from '../../../../../features/developments/messages';
import {
  UNIT_IMPORT_PROBLEMS_PAGE_SIZE,
  type UnitImportSheetData,
} from '../../../../../features/developments/unit-import-panel';
import { messageForError } from '../../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../../lib/list-params';
import {
  parsePanelPage,
  parsePanelParams,
  type PanelData,
  type PanelState,
} from '../../../../../lib/panel-params';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Importar unidades' };

export default async function UnitImportsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const { properties } = getContainer();
  const detail = await properties.getDevelopmentDetail.execute({ developmentId: id }, actor);
  if (detail.isErr()) {
    if (detail.error.type === 'DevelopmentNotFound' || detail.error.type === 'InvalidInput') {
      notFound();
    }
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={messageForError(detail.error, DEVELOPMENT_READ_ERROR_MESSAGES)} />
      </Card>
    );
  }

  const { value: list } = parseListParams(
    ListDevelopmentUnitImportsQuerySchema.omit({ developmentId: true }),
    query,
  );
  const [result, panel] = await Promise.all([
    properties.listDevelopmentUnitImports.execute({ ...list, developmentId: id }, actor),
    loadImportPanel(id, parsePanelParams(query), parsePanelPage(query), actor),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/emprendimientos/${id}?tab=unidades` as Route}
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a las unidades
      </Link>
      <PageHeader
        icon={FileSpreadsheetIcon}
        title="Unidades en Excel"
        subtitle={`${detail.value.name} · ${detail.value.code}`}
      />
      <p className="text-sm leading-normal text-muted-foreground">
        Exportá las unidades, cambiá precios, estados o superficies en el Excel y volvé a subirlo.
        Cada fila se reconoce por su piso y unidad: si existe, se actualiza; si no, se crea. Las
        filas con datos inválidos quedan en el reporte de cada importación.
      </p>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, UNIT_IMPORTS_ERROR_MESSAGES)} />
        ) : (
          <UnitImportsGrid
            developmentId={id}
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            sort={list.sort}
            detail={panel}
          />
        )}
      </Card>
    </div>
  );
}

/** La importación del panel y una página de sus filas con problemas. */
async function loadImportPanel(
  developmentId: string,
  panel: PanelState | undefined,
  page: number,
  actor: Actor,
): Promise<PanelData<UnitImportSheetData> | undefined> {
  if (panel?.kind !== 'edit') return undefined;
  const { properties } = getContainer();
  const input = { developmentId, importId: panel.id };
  const [job, problems] = await Promise.all([
    properties.getDevelopmentUnitImport.execute(input, actor),
    properties.listDevelopmentUnitImportProblems.execute(
      { ...input, page, pageSize: UNIT_IMPORT_PROBLEMS_PAGE_SIZE },
      actor,
    ),
  ]);
  if (job.isErr()) {
    return {
      id: panel.id,
      ok: false,
      message: messageForError(job.error, UNIT_IMPORT_ERROR_MESSAGES),
    };
  }
  return {
    id: panel.id,
    ok: true,
    value: {
      job: job.value,
      problems: problems.isOk()
        ? { id: panel.id, ok: true, value: { ...problems.value, rows: problems.value.items } }
        : {
            id: panel.id,
            ok: false,
            message: messageForError(problems.error, UNIT_IMPORT_ERROR_MESSAGES),
          },
    },
  };
}
