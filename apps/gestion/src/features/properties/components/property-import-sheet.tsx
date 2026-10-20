'use client';

import {
  MAX_PROPERTY_IMPORT_FILE_BYTES,
  MAX_PROPERTY_IMPORT_ROWS,
  PROPERTY_IMPORT_ACCEPT,
  PROPERTY_IMPORT_FAILURE_LABELS,
  PROPERTY_IMPORT_FIELD_LABELS,
  PROPERTY_IMPORT_PROBLEM_LABELS,
  PROPERTY_IMPORT_STATUS_LABELS,
  PROPERTY_IMPORT_WARNING_VALUES,
  type PropertyImportPreview,
  type PropertyImportProblemRow,
  type PropertyImportRow,
  type PropertyImportSourceValue,
  type PropertyImportStatusValue,
} from '@norde/core/properties/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { DataTable, type DataTableColumn } from '@norde/ui/components/data-table';
import { FileChip, FileDropzone } from '@norde/ui/components/file-dropzone';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill, type StatusTone } from '@norde/ui/components/status-pill';
import { Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import {
  EntitySheet,
  SheetError,
  SheetLoading,
  useLastDefined,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { previewPropertyImportAction, startPropertyImportAction } from '../import-actions';
import {
  PROPERTY_IMPORT_PROBLEMS_PAGE_SIZE,
  type PropertyImportProblemsPage,
  type PropertyImportSheetData,
} from '../import-panel';

const count = (value: number) => value.toLocaleString('es-AR');

const STATUS_TONES: Readonly<Record<PropertyImportStatusValue, StatusTone>> = {
  pending: 'amber',
  running: 'amber',
  done: 'green',
  failed: 'red',
};

export function isPropertyImportRunning(status: PropertyImportStatusValue): boolean {
  return status === 'pending' || status === 'running';
}

export function PropertyImportStatusPill({
  status,
}: {
  readonly status: PropertyImportStatusValue;
}) {
  return (
    <StatusPill tone={STATUS_TONES[status]}>{PROPERTY_IMPORT_STATUS_LABELS[status]}</StatusPill>
  );
}

/** De dónde salieron las propiedades: el archivo subido o la API de Tokko. */
export function importOrigin(job: PropertyImportRow): string {
  return job.source === 'api' ? 'API de Tokko' : job.fileName;
}

/** Quién pidió la importación; un usuario dado de baja no tiene nombre. */
export function requesterName(job: PropertyImportRow): string {
  return job.requestedBy?.name ?? 'un usuario dado de baja';
}

/** Alta de una importación: subir la exportación de Tokko, ver qué trae e importar. */
function ImportWizard({
  onStarted,
  onCancel,
}: {
  readonly onStarted: (importId: string) => void;
  readonly onCancel: () => void;
}) {
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState<PropertyImportPreview | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function choose(files: readonly File[]) {
    const [picked] = files;
    if (picked === undefined) return;
    setError(undefined);
    if (picked.size > MAX_PROPERTY_IMPORT_FILE_BYTES) {
      setError('El archivo pesa más de 5 MB.');
      return;
    }
    startTransition(async () => {
      const form = new FormData();
      form.set('file', picked);
      try {
        const result = await previewPropertyImportAction(form);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setFile(picked);
        setPreview(result);
      } catch {
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  function reset() {
    setFile(undefined);
    setPreview(undefined);
    setError(undefined);
  }

  function start() {
    if (file === undefined) return;
    setError(undefined);
    startTransition(async () => {
      const form = new FormData();
      form.set('file', file);
      let importId: string | undefined;
      const message = await runAction(async () => {
        const result = await startPropertyImportAction(form);
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

  return (
    <>
      <SheetBody scroll>
        <FormAlert message={error} />
        {preview === undefined || file === undefined ? (
          <div className="flex flex-col gap-3">
            <FileDropzone
              onFiles={choose}
              accept={PROPERTY_IMPORT_ACCEPT}
              disabled={pending}
              title={pending ? 'Leyendo el archivo…' : 'Elegí o arrastrá la exportación de Tokko'}
              hint={`El .csv de "Propiedades" de Tokko, tal como sale, de hasta 5 MB y ${count(MAX_PROPERTY_IMPORT_ROWS)} filas.`}
            />
            <p className="text-sm text-muted-foreground">
              Cada fila se crea como una propiedad disponible, con el código de Tokko. Las que ya
              están en Norde con ese código no se duplican. El propietario se busca o se crea en
              contactos, y la propiedad queda como unidad si hay un emprendimiento con ese nombre.
              Las fotos y la descripción no vienen en esta exportación: las trae la API de Tokko.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <FileChip name={file.name} {...(pending ? {} : { onRemove: reset })} />
              <span className="text-sm text-muted-foreground">
                {count(preview.rowCount)} {preview.rowCount === 1 ? 'propiedad' : 'propiedades'}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Datos que se importan</h3>
              <ul className="flex flex-wrap gap-1.5" aria-label="Datos que se importan">
                {preview.fields.map((field) => (
                  <li key={field}>
                    <Badge variant="secondary">{PROPERTY_IMPORT_FIELD_LABELS[field]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
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
            Importar {count(preview.rowCount)}{' '}
            {preview.rowCount === 1 ? 'propiedad' : 'propiedades'}
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

function getProblemId(problem: PropertyImportProblemRow): string {
  return `${String(problem.rowNumber)}-${problem.code}`;
}

function ProblemsGrid({
  data,
  source,
  running,
  pending,
  onPageChange,
}: {
  readonly data: PropertyImportProblemsPage;
  /** Desde la API no hay filas: se muestra el código de Tokko. */
  readonly source: PropertyImportSourceValue;
  readonly running: boolean;
  readonly pending: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const columns = useMemo(
    (): readonly DataTableColumn<PropertyImportProblemRow>[] => [
      source === 'api'
        ? {
            id: 'reference',
            header: 'Código',
            className: 'w-[170px] whitespace-normal break-all tabular-nums',
            cell: (problem) => problem.reference ?? '—',
          }
        : {
            id: 'rowNumber',
            header: 'Fila',
            className: 'w-[70px] tabular-nums',
            cell: (problem) => problem.rowNumber,
          },
      {
        id: 'problem',
        header: 'Qué pasó',
        className: 'whitespace-normal',
        cell: (problem) => (
          <span className="flex flex-wrap items-center gap-1.5">
            {PROPERTY_IMPORT_WARNING_VALUES.includes(problem.code) && (
              <Badge variant="warning">Aviso</Badge>
            )}
            {problem.field === undefined
              ? PROPERTY_IMPORT_PROBLEM_LABELS[problem.code]
              : `${PROPERTY_IMPORT_PROBLEM_LABELS[problem.code]} (${PROPERTY_IMPORT_FIELD_LABELS[problem.field]})`}
          </span>
        ),
      },
      {
        id: 'property',
        header: 'Propiedad',
        className: 'w-[120px] text-right',
        cell: (problem) =>
          problem.propertyId !== undefined && (
            <Link
              href={`/propiedades/${problem.propertyId}` as Route}
              className="text-primary hover:underline"
            >
              Ver propiedad
            </Link>
          ),
      },
    ],
    [source],
  );
  return (
    <DataTable
      label="Filas con problemas"
      columns={columns}
      rows={data.rows}
      total={data.total}
      page={data.page}
      pageSize={data.pageSize}
      pageSizes={[PROPERTY_IMPORT_PROBLEMS_PAGE_SIZE]}
      onPageChange={onPageChange}
      onPageSizeChange={() => undefined}
      pending={pending}
      getRowId={getProblemId}
      empty={
        running
          ? 'Por ahora, ninguna con problemas.'
          : source === 'api'
            ? 'Se trajeron todas las propiedades.'
            : 'Se importaron todas las filas.'
      }
    />
  );
}

/** Una importación: estado, totales y las filas con problemas o avisos. */
function ImportDetail({
  data,
  pending,
  onPageChange,
}: {
  readonly data: PropertyImportSheetData;
  readonly pending: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const { job, problems } = data;
  const running = isPropertyImportRunning(job.status);
  const fromApi = job.source === 'api';
  return (
    <SheetBody scroll className="gap-5">
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <PropertyImportStatusPill status={job.status} />
          {running && (
            <span className="text-muted-foreground">
              {count(job.totals.processed)} de {count(job.totals.rows)}{' '}
              {fromApi ? 'propiedades procesadas' : 'filas procesadas'}
            </span>
          )}
        </div>
        <p className="text-muted-foreground">
          La importó {requesterName(job)} el {formatDateTime(job.createdAt)}.
        </p>
        {job.failure !== undefined && (
          <p role="alert" className="text-destructive">
            {PROPERTY_IMPORT_FAILURE_LABELS[job.failure]}
          </p>
        )}
      </div>
      <div className={`grid grid-cols-2 gap-2 ${fromApi ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        <Stat label={fromApi ? 'Propiedades' : 'Filas'} value={job.totals.rows} />
        <Stat label="Creadas" value={job.totals.created} />
        {fromApi && <Stat label="Completadas" value={job.totals.completed} />}
        <Stat label="Ya estaban" value={job.totals.existing} />
        <Stat label="Con errores" value={job.totals.failed} />
      </div>
      {fromApi && (
        <p className="text-sm text-muted-foreground">
          Completadas: ya estaban en Norde y se les agregó lo que no tenían (fotos, descripción,
          coordenadas o comentarios de Tokko), sin pisar lo cargado.
        </p>
      )}
      <div className="-mx-4 flex flex-col gap-2">
        <h3 className="px-4 text-sm font-medium">
          {fromApi ? 'Propiedades con problemas' : 'Filas con problemas'}
        </h3>
        {problems.ok ? (
          <ProblemsGrid
            data={problems.value}
            source={job.source}
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
export function PropertyImportSheet({
  navigation,
  detail,
}: {
  readonly navigation: PanelNavigation;
  readonly detail: PanelData<PropertyImportSheetData> | undefined;
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
      title={creating ? 'Importar propiedades de Tokko' : 'Importación de propiedades'}
      description={
        creating
          ? 'Subí la exportación de propiedades de Tokko e importá.'
          : ready?.ok === true
            ? importOrigin(ready.value.job)
            : undefined
      }
    >
      {creating ? (
        <ImportWizard
          key="new"
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
