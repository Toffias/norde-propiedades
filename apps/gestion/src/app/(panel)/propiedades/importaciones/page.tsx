import { ListPropertyImportsQuerySchema } from '@norde/core/properties/contracts';
import type { Actor } from '@norde/core/shared';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { ArrowLeftIcon, UploadIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { tokkoApiEnabled } from '../../../../config/env';
import { getContainer } from '../../../../container';
import { PropertyImportsGrid } from '../../../../features/properties/components/property-imports-grid';
import {
  PROPERTY_IMPORT_ERROR_MESSAGES,
  PROPERTY_IMPORT_PROBLEMS_ERROR_MESSAGES,
  PROPERTY_IMPORTS_ERROR_MESSAGES,
} from '../../../../features/properties/import-messages';
import {
  PROPERTY_IMPORT_PROBLEMS_PAGE_SIZE,
  type PropertyImportSheetData,
} from '../../../../features/properties/import-panel';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import {
  parsePanelPage,
  parsePanelParams,
  type PanelData,
  type PanelState,
} from '../../../../lib/panel-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Importar propiedades' };

export default async function PropertyImportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query } = parseListParams(ListPropertyImportsQuerySchema, params);
  const tokko = tokkoApiEnabled();
  const [result, detail] = await Promise.all([
    getContainer().properties.listPropertyImports.execute(query, actor),
    loadImportPanel(parsePanelParams(params), parsePanelPage(params), actor),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/propiedades"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a propiedades
      </Link>
      <PageHeader
        icon={UploadIcon}
        title="Importar propiedades"
        subtitle="Las propiedades de Tokko, con el historial de cada importación"
      />
      <p className="text-sm leading-normal text-muted-foreground">
        Cada propiedad de Tokko se crea disponible, con su código de Tokko. Las que ya están en
        Norde con ese código no se duplican, y las que tienen datos inválidos quedan en el reporte
        de la importación.
        {tokko &&
          ' Desde la API de Tokko también llegan los emprendimientos, las fotos, la descripción y las coordenadas, y se completa lo que ya estaba sin pisar lo cargado.'}
      </p>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError
            message={messageForError(result.error, PROPERTY_IMPORTS_ERROR_MESSAGES)}
          />
        ) : (
          <PropertyImportsGrid
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            sort={query.sort}
            detail={detail}
            tokkoApi={tokko}
          />
        )}
      </Card>
    </div>
  );
}

/** La importación del panel y una página de sus filas con problemas. */
async function loadImportPanel(
  panel: PanelState | undefined,
  page: number,
  actor: Actor,
): Promise<PanelData<PropertyImportSheetData> | undefined> {
  if (panel?.kind !== 'edit') return undefined;
  const { properties } = getContainer();
  const [job, problems] = await Promise.all([
    properties.getPropertyImport.execute({ importId: panel.id }, actor),
    properties.listPropertyImportProblems.execute(
      { importId: panel.id, page, pageSize: PROPERTY_IMPORT_PROBLEMS_PAGE_SIZE },
      actor,
    ),
  ]);
  if (job.isErr()) {
    return {
      id: panel.id,
      ok: false,
      message: messageForError(job.error, PROPERTY_IMPORT_ERROR_MESSAGES),
    };
  }
  return {
    id: panel.id,
    ok: true,
    value: {
      job: job.value,
      problems: problems.isOk()
        ? {
            id: panel.id,
            ok: true,
            value: { ...problems.value, rows: problems.value.items },
          }
        : {
            id: panel.id,
            ok: false,
            message: messageForError(problems.error, PROPERTY_IMPORT_PROBLEMS_ERROR_MESSAGES),
          },
    },
  };
}
