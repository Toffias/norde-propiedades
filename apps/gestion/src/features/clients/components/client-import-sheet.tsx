'use client';

import {
  CLIENT_IMPORT_ACCEPT,
  CLIENT_IMPORT_FAILURE_LABELS,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELD_VALUES,
  IMPORT_PROBLEM_LABELS,
  MAX_CLIENT_IMPORT_FILE_BYTES,
  MAX_CLIENT_IMPORT_ROWS,
  type ClientImportPreview,
  type ClientImportProblemRow,
  type ImportFieldValue,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { DataTable, type DataTableColumn } from '@norde/ui/components/data-table';
import { FileChip, FileDropzone } from '@norde/ui/components/file-dropzone';
import { Label } from '@norde/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import { loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import {
  EntitySheet,
  SheetError,
  SheetLoading,
  useLastDefined,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { userName } from '../client-format';
import { previewClientImportAction, startClientImportAction } from '../import-actions';
import {
  IMPORT_PROBLEMS_PAGE_SIZE,
  type ClientImportProblemsPage,
  type ClientImportSheetData,
} from '../import-panel';
import { ImportStatusPill, isImportRunning } from './client-import-status';

/** "No importar" en el select de una columna. */
const SKIP = 'skip';
const count = (value: number) => value.toLocaleString('es-AR');

type Mapping = Partial<Record<ImportFieldValue, number | undefined>>;

/** Hasta dos valores de ejemplo de una columna, para reconocerla. */
function examples(preview: ClientImportPreview, column: number | undefined): string {
  if (column === undefined) return '';
  return preview.sample
    .map((row) => row[column])
    .filter((value): value is string => value !== null && value !== undefined)
    .slice(0, 2)
    .join(' · ');
}

/** Alta de una importación: elegir el Excel, revisar qué columna va con cada dato e importar. */
function ImportWizard({
  canPickAgents,
  onStarted,
  onCancel,
}: {
  readonly canPickAgents: boolean;
  readonly onStarted: (importId: string) => void;
  readonly onCancel: () => void;
}) {
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState<ClientImportPreview | undefined>();
  const [mapping, setMapping] = useState<Mapping>({});
  const [agentId, setAgentId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function choose(files: readonly File[]) {
    const [picked] = files;
    if (picked === undefined) return;
    setError(undefined);
    if (picked.size > MAX_CLIENT_IMPORT_FILE_BYTES) {
      setError('El archivo pesa más de 10 MB. Partilo en varios archivos.');
      return;
    }
    startTransition(async () => {
      const form = new FormData();
      form.set('file', picked);
      try {
        const result = await previewClientImportAction(form);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setFile(picked);
        setPreview(result);
        setMapping(result.suggestedMapping);
      } catch {
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  function reset() {
    setFile(undefined);
    setPreview(undefined);
    setMapping({});
    setError(undefined);
  }

  function start() {
    if (file === undefined) return;
    setError(undefined);
    startTransition(async () => {
      const form = new FormData();
      form.set('file', file);
      // JSON.stringify deja afuera los datos sin columna (`undefined`).
      form.set('mapping', JSON.stringify(mapping));
      if (agentId !== undefined) form.set('agentId', agentId);
      let importId: string | undefined;
      const message = await runAction(async () => {
        const result = await startClientImportAction(form);
        importId = result.importId;
        return result;
      });
      if (message !== undefined || importId === undefined) {
        setError(message ?? UNEXPECTED_ERROR_MESSAGE);
        return;
      }
      toast.success('La importación está en proceso');
      onStarted(importId);
    });
  }

  const used = new Set(Object.values(mapping).filter((column) => column !== undefined));

  return (
    <>
      <SheetBody scroll>
        <FormAlert message={error} />
        {preview === undefined || file === undefined ? (
          <div className="flex flex-col gap-3">
            <FileDropzone
              onFiles={choose}
              accept={CLIENT_IMPORT_ACCEPT}
              disabled={pending}
              title={pending ? 'Leyendo el archivo…' : 'Elegí o arrastrá el Excel'}
              hint={`Un .xlsx de hasta 10 MB y ${count(MAX_CLIENT_IMPORT_ROWS)} filas, con los encabezados en la primera fila.`}
            />
            <p className="text-sm text-muted-foreground">
              Después de subirlo vas a poder revisar qué columna va con cada dato antes de importar.
              Los contactos que ya existen (mismo teléfono o email) no se duplican.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <FileChip name={file.name} {...(pending ? {} : { onRemove: reset })} />
              <span className="text-sm text-muted-foreground">
                {count(preview.rowCount)} {preview.rowCount === 1 ? 'fila' : 'filas'} con datos
              </span>
            </div>

            <fieldset disabled={pending} className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium">¿Qué columna va con cada dato?</legend>
              <p className="text-sm text-muted-foreground">
                Hace falta el nombre (o la empresa) y al menos un teléfono o email. Los tipos de
                cliente van separados por coma.
              </p>
              {IMPORT_FIELD_VALUES.map((field) => {
                const column = mapping[field];
                const id = `import-field-${field}`;
                return (
                  <div
                    key={field}
                    className="grid gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
                  >
                    <Label htmlFor={id}>{IMPORT_FIELD_LABELS[field]}</Label>
                    <div className="flex min-w-0 flex-col gap-1">
                      <Select
                        value={column === undefined ? SKIP : String(column)}
                        onValueChange={(next) => {
                          setMapping((current) => ({
                            ...current,
                            [field]: next === SKIP ? undefined : Number(next),
                          }));
                        }}
                      >
                        <SelectTrigger id={id} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>No importar</SelectItem>
                          {preview.headers.map((header, index) => (
                            <SelectItem
                              key={`${String(index)}-${header}`}
                              value={String(index)}
                              disabled={used.has(index) && column !== index}
                            >
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {column !== undefined && (
                        <span className="truncate text-xs text-muted-foreground">
                          {examples(preview, column) || 'Sin datos en las primeras filas'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </fieldset>

            {canPickAgents && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-agent">Agente a cargo</Label>
                <EntityPicker
                  id="import-agent"
                  value={agentId}
                  initial={undefined}
                  onChange={setAgentId}
                  loadPage={loadUserOptions}
                  placeholder="Vos"
                  searchPlaceholder="Buscar agente"
                  clearLabel="Quedan a tu cargo"
                />
              </div>
            )}
          </div>
        )}
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
        {preview !== undefined && (
          <Button type="button" disabled={pending} onClick={start}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Importar {count(preview.rowCount)} {preview.rowCount === 1 ? 'fila' : 'filas'}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{count(value)}</p>
    </div>
  );
}

function getProblemId(problem: ClientImportProblemRow): string {
  return `${String(problem.rowNumber)}-${problem.code}`;
}

function ProblemsGrid({
  data,
  running,
  pending,
  onPageChange,
}: {
  readonly data: ClientImportProblemsPage;
  /** Todavía se están procesando filas. */
  readonly running: boolean;
  readonly pending: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const columns = useMemo(
    (): readonly DataTableColumn<ClientImportProblemRow>[] => [
      {
        id: 'rowNumber',
        header: 'Fila',
        className: 'w-[70px] tabular-nums',
        cell: (problem) => problem.rowNumber,
      },
      {
        id: 'problem',
        header: 'Por qué no se importó',
        className: 'whitespace-normal',
        cell: (problem) =>
          problem.field === undefined
            ? IMPORT_PROBLEM_LABELS[problem.code]
            : `${IMPORT_PROBLEM_LABELS[problem.code]} (${IMPORT_FIELD_LABELS[problem.field]})`,
      },
      {
        id: 'client',
        header: 'Contacto',
        className: 'w-[120px] text-right',
        cell: (problem) =>
          problem.clientId !== undefined && (
            <Link
              href={`/contactos/${problem.clientId}` as Route}
              className="text-primary hover:underline"
            >
              Ver contacto
            </Link>
          ),
      },
    ],
    [],
  );
  return (
    <DataTable
      label="Filas que no se importaron"
      columns={columns}
      rows={data.rows}
      total={data.total}
      page={data.page}
      pageSize={data.pageSize}
      pageSizes={[IMPORT_PROBLEMS_PAGE_SIZE]}
      onPageChange={onPageChange}
      onPageSizeChange={() => undefined}
      pending={pending}
      getRowId={getProblemId}
      empty={running ? 'Por ahora, ninguna fila con problemas.' : 'Se importaron todas las filas.'}
    />
  );
}

/** Una importación: estado, totales y las filas que no se importaron. */
function ImportDetail({
  data,
  pending,
  onPageChange,
}: {
  readonly data: ClientImportSheetData;
  readonly pending: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const { job, problems } = data;
  const running = isImportRunning(job.status);
  return (
    <SheetBody scroll className="gap-5">
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <ImportStatusPill status={job.status} />
          {running && (
            <span className="text-muted-foreground">
              {count(job.totals.processed)} de {count(job.totals.rows)} filas procesadas
            </span>
          )}
        </div>
        <p className="text-muted-foreground">
          La importó {userName(job.requestedBy)} el {formatDateTime(job.createdAt)}. Los contactos
          quedan a cargo de {userName(job.agent)}.
        </p>
        {job.failure !== undefined && (
          <p role="alert" className="text-destructive">
            {CLIENT_IMPORT_FAILURE_LABELS[job.failure]}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Filas" value={job.totals.rows} />
        <Stat label="Creados" value={job.totals.created} />
        <Stat label="Duplicados" value={job.totals.duplicates} />
        <Stat label="Con errores" value={job.totals.failed} />
      </div>
      <div className="-mx-4 flex flex-col gap-2">
        <h3 className="px-4 text-sm font-medium">Filas que no se importaron</h3>
        {problems.ok ? (
          <ProblemsGrid
            data={problems.value}
            running={running}
            pending={pending}
            onPageChange={onPageChange}
          />
        ) : (
          <SheetError message={problems.message} />
        )}
      </div>
    </SheetBody>
  );
}

/** El panel de las importaciones: el alta (`?panel=new`) o el detalle de una (`?panel=<id>`). */
export function ClientImportSheet({
  navigation,
  detail,
  canPickAgents,
}: {
  readonly navigation: PanelNavigation;
  readonly detail: PanelData<ClientImportSheetData> | undefined;
  readonly canPickAgents: boolean;
}) {
  const { panel, close, openEdit, setPanelPage, pending } = navigation;
  const shown = useLastDefined(panel);
  const data = useLastDefined(detail);
  const creating = shown?.kind === 'new';
  const ready = shown?.kind === 'edit' && data?.id === shown.id ? data : undefined;

  return (
    <EntitySheet
      open={panel !== undefined}
      onClose={close}
      width="wide"
      title={creating ? 'Importar contactos desde Excel' : 'Importación de contactos'}
      description={
        creating
          ? 'Subí el archivo, revisá las columnas e importá.'
          : ready?.ok === true
            ? ready.value.job.fileName
            : undefined
      }
    >
      {creating ? (
        <ImportWizard
          key="new"
          canPickAgents={canPickAgents}
          onStarted={(importId) => {
            openEdit(importId);
          }}
          onCancel={close}
        />
      ) : ready === undefined ? (
        <SheetLoading />
      ) : !ready.ok ? (
        <SheetError message={ready.message} />
      ) : (
        <ImportDetail data={ready.value} pending={pending} onPageChange={setPanelPage} />
      )}
    </EntitySheet>
  );
}
