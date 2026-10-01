'use client';

import {
  MAX_COMPANY_FILE_UPLOAD_BYTES,
  type FolderCrumb,
  type FolderEntry,
} from '@norde/core/settings/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { FileDropzone } from '@norde/ui/components/file-dropzone';
import { Input } from '@norde/ui/components/input';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { toast } from '@norde/ui/components/sonner';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDate } from '../../../lib/format';
import { FormAlert } from '../../shared/components/form-alert';
import { ServerDataTable } from '../../shared/components/server-data-table';
import {
  createFolderAction,
  deleteFolderAction,
  moveCompanyFileToTrashAction,
  renameCompanyFileAction,
  renameFolderAction,
  uploadCompanyFileAction,
} from '../actions';

const FILES_ROUTE = '/mi-empresa/archivos';

/** Ruta del gestor en una carpeta (la raíz no lleva parámetro). */
export function folderHref(folderId: string | undefined): Route {
  return folderId === undefined ? FILES_ROUTE : `${FILES_ROUTE}?carpeta=${folderId}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toLocaleString('es-AR', { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
}

/** Diálogo con un solo campo de texto: nueva carpeta o renombrar. */
function NameDialog({
  title,
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  readonly title: string;
  readonly initial: string;
  readonly submitLabel: string;
  readonly onSubmit: (name: string) => Promise<ActionResult>;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(undefined);
            startTransition(async () => {
              const message = await runAction(() => onSubmit(name));
              if (message !== undefined) {
                setError(message);
                return;
              }
              onClose();
              router.refresh();
            });
          }}
        >
          <FormAlert message={error} />
          <Input
            aria-label="Nombre"
            autoFocus
            maxLength={120}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || name.trim() === ''}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Dialogs =
  | { readonly kind: 'upload' }
  | { readonly kind: 'new-folder' }
  | { readonly kind: 'rename'; readonly entry: FolderEntry }
  | undefined;

export interface CompanyFilesGridProps {
  readonly folderId: string | undefined;
  readonly breadcrumb: readonly FolderCrumb[];
  readonly rows: readonly FolderEntry[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly canUpload: boolean;
  readonly canManage: boolean;
}

function getRowId(entry: FolderEntry): string {
  return `${entry.kind}-${entry.id}`;
}

export function CompanyFilesGrid({
  folderId,
  breadcrumb,
  canUpload,
  canManage,
  ...page
}: CompanyFilesGridProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialogs>();
  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | undefined>();

  function upload(files: readonly File[]) {
    setUploadError(undefined);
    const tooLarge = files.find((file) => file.size > MAX_COMPANY_FILE_UPLOAD_BYTES);
    if (tooLarge) {
      setUploadError(`${tooLarge.name} supera los 25 MB.`);
      return;
    }
    startUpload(async () => {
      let uploaded = 0;
      for (const file of files) {
        const form = new FormData();
        form.set('file', file);
        if (folderId !== undefined) form.set('folderId', folderId);
        const message = await runAction(() => uploadCompanyFileAction(form));
        if (message !== undefined) {
          setUploadError(`${file.name}: ${message}`);
          break;
        }
        uploaded += 1;
      }
      if (uploaded > 0) {
        toast.success(uploaded === 1 ? 'Archivo subido' : `${String(uploaded)} archivos subidos`);
        router.refresh();
      }
      // Con un error, el modal queda abierto para mostrarlo.
      if (uploaded === files.length) setDialog(undefined);
    });
  }

  async function remove(entry: FolderEntry) {
    const message = await runAction(() =>
      entry.kind === 'folder'
        ? deleteFolderAction({ folderId: entry.id })
        : moveCompanyFileToTrashAction({ fileId: entry.id }),
    );
    if (message !== undefined) {
      toast.error(message);
      return;
    }
    toast.success(entry.kind === 'folder' ? 'Carpeta borrada' : 'Archivo enviado a la papelera');
    router.refresh();
  }

  const columns: readonly DataTableColumn<FolderEntry>[] = [
    {
      id: 'name',
      header: 'Nombre',
      sortable: true,
      className: 'font-medium',
      cell: (entry) =>
        entry.kind === 'folder' ? (
          <Link
            href={folderHref(entry.id)}
            className="inline-flex items-center gap-2 hover:underline"
          >
            <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{entry.name}</span>
          </Link>
        ) : (
          <a
            href={`${FILES_ROUTE}/${entry.id}/descargar`}
            className="inline-flex items-center gap-2 hover:underline"
          >
            <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{entry.name}</span>
          </a>
        ),
    },
    {
      id: 'size',
      header: 'Tamaño',
      sortable: true,
      showFrom: 'md',
      className: 'w-[110px] text-muted-foreground tabular-nums',
      cell: (entry) => (entry.kind === 'file' ? formatBytes(entry.sizeBytes) : EMPTY_VALUE),
    },
    {
      id: 'updatedAt',
      header: 'Modificado',
      sortable: true,
      showFrom: 'md',
      className: 'w-[130px] text-muted-foreground',
      cell: (entry) => formatDate(entry.updatedAt),
    },
    {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-[110px] text-right',
      cell: (entry) => (
        <RowActions>
          {entry.kind === 'file' && (
            <RowAction
              icon={DownloadIcon}
              label="Descargar"
              onClick={() => {
                window.location.assign(`${FILES_ROUTE}/${entry.id}/descargar`);
              }}
            />
          )}
          {canManage && (
            <RowAction
              icon={PencilIcon}
              label="Renombrar"
              onClick={() => {
                setDialog({ kind: 'rename', entry });
              }}
            />
          )}
          {canManage && (
            <RowAction
              icon={Trash2Icon}
              label={entry.kind === 'folder' ? 'Borrar la carpeta' : 'Enviar a la papelera'}
              onClick={() => {
                void remove(entry);
              }}
            />
          )}
        </RowActions>
      ),
    },
  ];

  // La carpeta de arriba: la anterior de la ruta, o la raíz.
  const parent = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 2] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {folderId !== undefined && (
          <Button asChild size="sm" variant="outline">
            <Link href={folderHref(parent?.id)}>
              <ArrowLeftIcon className="h-4 w-4" />
              Volver
            </Link>
          </Button>
        )}
        <nav aria-label="Ruta de la carpeta" className="flex flex-wrap items-center gap-1 text-sm">
          <Link href={folderHref(undefined)} className="text-muted-foreground hover:underline">
            Archivos
          </Link>
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.id} className="inline-flex items-center gap-1">
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
              {index === breadcrumb.length - 1 ? (
                <span className="font-medium" aria-current="page">
                  {crumb.name}
                </span>
              ) : (
                <Link href={folderHref(crumb.id)} className="text-muted-foreground hover:underline">
                  {crumb.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <ServerDataTable
          label="Archivos de la empresa"
          columns={columns}
          getRowId={getRowId}
          {...page}
          toolbar={
            canUpload || canManage ? (
              <>
                {canUpload && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setUploadError(undefined);
                      setDialog({ kind: 'upload' });
                    }}
                  >
                    <UploadIcon className="h-4 w-4" />
                    Subir archivos
                  </Button>
                )}
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDialog({ kind: 'new-folder' });
                    }}
                  >
                    <FolderPlusIcon className="h-4 w-4" />
                    Nueva carpeta
                  </Button>
                )}
                {canManage && (
                  <Button asChild size="sm" variant="outline" className="sm:ml-auto">
                    <Link href={`${FILES_ROUTE}/papelera`}>
                      <Trash2Icon className="h-4 w-4" />
                      Papelera
                    </Link>
                  </Button>
                )}
              </>
            ) : undefined
          }
          empty={
            folderId === undefined
              ? 'Todavía no hay archivos. Subí contratos modelo, manuales o planillas para que los use el equipo.'
              : 'Esta carpeta está vacía.'
          }
        />
      </div>

      <Dialog
        open={dialog?.kind === 'upload'}
        onOpenChange={(open) => {
          if (!open && !uploading) setDialog(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir archivos</DialogTitle>
            <DialogDescription>
              {breadcrumb.length === 0
                ? 'Van a la raíz de Archivos.'
                : `Van a la carpeta ${breadcrumb[breadcrumb.length - 1]?.name ?? ''}.`}
            </DialogDescription>
          </DialogHeader>
          <FormAlert message={uploadError} />
          <FileDropzone
            multiple
            disabled={uploading}
            title={uploading ? 'Subiendo…' : 'Arrastrá los archivos o hacé click para elegirlos'}
            hint="PDF, documentos, planillas, imágenes o ZIP, hasta 25 MB cada uno."
            onFiles={upload}
          />
        </DialogContent>
      </Dialog>
      {dialog?.kind === 'new-folder' && (
        <NameDialog
          title="Nueva carpeta"
          initial=""
          submitLabel="Crear"
          onSubmit={(name) =>
            createFolderAction(folderId === undefined ? { name } : { parentId: folderId, name })
          }
          onClose={() => {
            setDialog(undefined);
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <NameDialog
          title={dialog.entry.kind === 'folder' ? 'Renombrar la carpeta' : 'Renombrar el archivo'}
          initial={dialog.entry.name}
          submitLabel="Guardar"
          onSubmit={(name) =>
            dialog.entry.kind === 'folder'
              ? renameFolderAction({ folderId: dialog.entry.id, name })
              : renameCompanyFileAction({ fileId: dialog.entry.id, name })
          }
          onClose={() => {
            setDialog(undefined);
          }}
        />
      )}
    </div>
  );
}
