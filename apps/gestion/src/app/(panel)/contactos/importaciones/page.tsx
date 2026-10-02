import { ListClientImportsQuerySchema } from '@norde/core/clients/contracts';
import type { Actor } from '@norde/core/shared';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { ClientImportsGrid } from '../../../../features/clients/components/client-imports-grid';
import { ClientImportsHeader } from '../../../../features/clients/components/client-imports-header';
import {
  IMPORT_PROBLEMS_PAGE_SIZE,
  type ClientImportSheetData,
} from '../../../../features/clients/import-panel';
import {
  CLIENT_IMPORT_ERROR_MESSAGES,
  CLIENT_IMPORT_PROBLEMS_ERROR_MESSAGES,
  CLIENT_IMPORTS_ERROR_MESSAGES,
} from '../../../../features/clients/messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import {
  parsePanelPage,
  parsePanelParams,
  type PanelData,
  type PanelState,
} from '../../../../lib/panel-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Importar contactos' };

export default async function ClientImportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query } = parseListParams(ListClientImportsQuerySchema, params);
  const [result, detail] = await Promise.all([
    getContainer().clients.listClientImports.execute(query, actor),
    loadImportPanel(parsePanelParams(params), parsePanelPage(params), actor),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <ClientImportsHeader />
      <p className="text-sm leading-normal text-muted-foreground">
        Cada fila del Excel se da de alta como contacto. Las que tienen un teléfono o email que ya
        existe no se duplican, y las que tienen datos inválidos quedan en el reporte de la
        importación.
      </p>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, CLIENT_IMPORTS_ERROR_MESSAGES)} />
        ) : (
          <ClientImportsGrid
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            sort={query.sort}
            detail={detail}
            canPickAgents={actor.can('clients:reassign') && actor.can('users:read')}
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
): Promise<PanelData<ClientImportSheetData> | undefined> {
  if (panel?.kind !== 'edit') return undefined;
  const { clients } = getContainer();
  const [job, problems] = await Promise.all([
    clients.getClientImport.execute({ importId: panel.id }, actor),
    clients.listClientImportProblems.execute(
      { importId: panel.id, page, pageSize: IMPORT_PROBLEMS_PAGE_SIZE },
      actor,
    ),
  ]);
  if (job.isErr()) {
    return {
      id: panel.id,
      ok: false,
      message: messageForError(job.error, CLIENT_IMPORT_ERROR_MESSAGES),
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
            message: messageForError(problems.error, CLIENT_IMPORT_PROBLEMS_ERROR_MESSAGES),
          },
    },
  };
}
