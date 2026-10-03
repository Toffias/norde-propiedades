'use client';

import {
  MAX_UNIT_IMPORT_FILE_BYTES,
  MAX_UNIT_IMPORT_ROWS,
  UNIT_IMPORT_ACCEPT,
  UNIT_IMPORT_FAILURE_LABELS,
  UNIT_IMPORT_FIELD_LABELS,
  UNIT_IMPORT_FIELD_VALUES,
  UNIT_IMPORT_PROBLEM_LABELS,
  type DevelopmentUnitImportPreview,
  type DevelopmentUnitImportProblemRow,
  type UnitImportFieldValue,
} from '@norde/core/properties/contracts';
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
import { ImportStatusPill, isImportRunning } from '../../clients/components/client-import-status';
import {
  EntitySheet,
  SheetError,
  SheetLoading,
  useLastDefined,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { previewUnitImportAction, startUnitImportAction } from '../unit-import-actions';
import {
  UNIT_IMPORT_PROBLEMS_PAGE_SIZE,
  type UnitImportProblemsPage,
  type UnitImportSheetData,
} from '../unit-import-panel';

/** "No importar" en el select de una columna. */
const SKIP = 'skip';
const count = (value: number) => value.toLocaleString('es-AR');

type Mapping = Partial<Record<UnitImportFieldValue, number | undefined>>;

/** Hasta dos valores de ejemplo de una columna, para reconocerla. */
function examples(preview: DevelopmentUnitImportPreview, column: number | undefined): string {
  if (column === undefined) return '';
  return preview.sample
    .map((row) => row[column])
    .filter((value): value is string => value !== null && value !== undefined)
    .slice(0, 2)
    .join(' · ');
}

/** Alta de una importación: elegir el Excel, revisar qué columna va con cada dato e importar. */
function ImportWizard({
  developmentId,
  onStarted,
  onCancel,
}: {
  readonly developmentId: string;
  readonly onStarted: (importId: string) => void;
  readonly onCancel: () => void;
}) {
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState<DevelopmentUnitImportPreview | undefined>();
  const [mapping, setMapping] = useState<Mapping>({});
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function choose(files: readonly File[]) {
    const [picked] = files;
    if (picked === undefined) return;
    setError(undefined);
    if (picked.size > MAX_UNIT_IMPORT_FILE_BYTES) {
      setError('El archivo pesa más de 5 MB. Partilo en varios archivos.');
      return;
    }
    startTransition(async () => {
      const form = new FormData();
      form.set('developmentId', developmentId);
      form.set('file', picked);
      try {
        const result = await previewUnitImportAction(form);
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
      form.set('developmentId', developmentId);
      form.set('file', file);
      // JSON.stringify deja afuera los datos sin columna (`undefined`).
      form.set('mapping', JSON.stringify(mapping));
      let importId: string | undefined;
      const message = await runAction(async () => {
        const result = await startUnitImportAction(form);
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
              accept={UNIT_IMPORT_ACCEPT}
              disabled={pending}
              title={pending ? 'Leyendo el archivo…' : 'Elegí o arrastrá el Excel'}
              hint={`Un .xlsx de hasta 5 MB y ${count(MAX_UNIT_IMPORT_ROWS)} filas, con los encabezados en la primera fila.`}
            />
            <p className="text-sm text-muted-foreground">
              Cada fila es una unidad: si ya existe una con el mismo piso y unidad, se actualiza; si
              no, se crea heredando los datos del emprendimiento. Las celdas vacías no borran nada.
              Para empezar, exportá las unidades a Excel, editalo y volvé a subirlo.
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
                Hace falta la unidad. Para crear una unidad nueva, además, el tipo y la moneda de al
                menos una operación. El tipo de una unidad que ya existe no se cambia.
              </p>
              {UNIT_IMPORT_FIELD_VALUES.map((field) => {
                const column = mapping[field];
                const id = `unit-import-field-${field}`;
                return (
                  <div
                    key={field}
                    className="grid gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
                  >
                    <Label htmlFor={id}>{UNIT_IMPORT_FIELD_LABELS[field]}</Label>
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

function getProblemId(problem: DevelopmentUnitImportProblemRow): string {
  return `${String(problem.rowNumber)}-${problem.code}`;
}

function ProblemsGrid({
  data,
  running,
  pending,
  onPageChange,
}: {
  readonly data: UnitImportProblemsPage;
  /** Todavía se están procesando filas. */
  readonly running: boolean;
  readonly pending: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const columns = useMemo(
    (): readonly DataTableColumn<DevelopmentUnitImportProblemRow>[] => [
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
            ? UNIT_IMPORT_PROBLEM_LABELS[problem.code]
            : `${UNIT_IMPORT_PROBLEM_LABELS[problem.code]} (${UNIT_IMPORT_FIELD_LABELS[problem.field]})`,
      },
      {
        id: 'unit',
        header: 'Unidad',
        className: 'w-[110px] text-right',
        cell: (problem) =>
          problem.propertyId !== undefined && (
            <Link
              href={`/propiedades/${problem.propertyId}` as Route}
              className="text-primary hover:underline"
            >
              Ver unidad
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
      pageSizes={[UNIT_IMPORT_PROBLEMS_PAGE_SIZE]}
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
  readonly data: UnitImportSheetData;
  readonly pending: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const { job, problems } = data;
  const running = isImportRunning(job.status);
  const requestedBy = job.requestedBy?.name ?? 'un usuario';
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
          La importó {requestedBy} el {formatDateTime(job.createdAt)}.
        </p>
        {job.failure !== undefined && (
          <p role="alert" className="text-destructive">
            {UNIT_IMPORT_FAILURE_LABELS[job.failure]}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Creadas" value={job.totals.created} />
        <Stat label="Actualizadas" value={job.totals.updated} />
        <Stat label="Sin cambios" value={job.totals.unchanged} />
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

/** El panel de las importaciones de unidades: el alta (`?panel=new`) o el detalle de una. */
export function UnitImportSheet({
  developmentId,
  navigation,
  detail,
}: {
  readonly developmentId: string;
  readonly navigation: PanelNavigation;
  readonly detail: PanelData<UnitImportSheetData> | undefined;
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
      title={creating ? 'Importar unidades desde Excel' : 'Importación de unidades'}
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
          developmentId={developmentId}
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
