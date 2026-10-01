'use client';

import {
  ATTACHMENT_UPLOAD_ACCEPT,
  MAX_ATTACHMENT_UPLOAD_BYTES,
  type PropertyAttachmentRow,
} from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';
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
import { Switch } from '@norde/ui/components/switch';
import {
  DownloadIcon,
  FileIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { runAction } from '../../../../lib/action-result';
import { formatDate } from '../../../../lib/format';
import { formatBytes } from '../../../settings/components/company-files-grid';
import { ConfirmActionDialog } from '../../../shared/components/confirm-action-dialog';
import { FormAlert } from '../../../shared/components/form-alert';
import { ServerDataTable } from '../../../shared/components/server-data-table';
import {
  deletePropertyAttachmentAction,
  updatePropertyAttachmentAction,
  uploadPropertyAttachmentAction,
} from '../../detail-actions';

/** Archivos de la ficha (escrituras, reglamentos): subir, renombrar, mostrar en la web, bajar y borrar. */
export function AttachmentsGrid({
  propertyId,
  page,
  sort,
  canEdit,
}: {
  readonly propertyId: string;
  readonly page: Page<PropertyAttachmentRow>;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<PropertyAttachmentRow | undefined>();
  const [deleting, setDeleting] = useState<PropertyAttachmentRow | undefined>();
  const [, startTransition] = useTransition();

  const toggleWeb = (row: PropertyAttachmentRow, showOnWeb: boolean) => {
    startTransition(async () => {
      const error = await runAction(() =>
        updatePropertyAttachmentAction(propertyId, { attachmentId: row.id, showOnWeb }),
      );
      if (error === undefined)
        toast.success(showOnWeb ? 'Se muestra en la web.' : 'Ya no se muestra en la web.');
      else toast.error(error);
    });
  };

  const columns: readonly DataTableColumn<PropertyAttachmentRow>[] = [
    {
      id: 'name',
      header: 'Nombre',
      sortable: true,
      cell: (row) => (
        <span className="inline-flex items-center gap-2 font-medium">
          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="break-all">{row.name}</span>
        </span>
      ),
    },
    {
      id: 'size',
      header: 'Tamaño',
      showFrom: 'md',
      cell: (row) => <span className="tabular-nums">{formatBytes(row.sizeBytes)}</span>,
    },
    {
      id: 'createdAt',
      header: 'Subido',
      sortable: true,
      showFrom: 'sm',
      cell: (row) => (
        <span className="text-muted-foreground">
          {formatDate(row.createdAt)}
          {row.uploadedBy.name === undefined ? '' : ` · ${row.uploadedBy.name}`}
        </span>
      ),
    },
    {
      id: 'web',
      header: 'En la web',
      cell: (row) => (
        <Switch
          checked={row.showOnWeb}
          disabled={!canEdit}
          aria-label={`Mostrar ${row.name} en la web`}
          onCheckedChange={(checked) => {
            toggleWeb(row, checked);
          }}
        />
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-0',
      cell: (row) => (
        <RowActions>
          <RowAction
            icon={DownloadIcon}
            label="Descargar"
            onClick={() => {
              window.location.assign(`/propiedades/${propertyId}/archivos/${row.id}`);
            }}
          />
          {canEdit && (
            <>
              <RowAction
                icon={PencilIcon}
                label="Renombrar"
                onClick={() => {
                  setRenaming(row);
                }}
              />
              <RowAction
                icon={Trash2Icon}
                label="Borrar"
                destructive
                onClick={() => {
                  setDeleting(row);
                }}
              />
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <ServerDataTable
        label="Archivos de la propiedad"
        columns={columns}
        getRowId={(row) => row.id}
        rows={page.items}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        sort={sort}
        toolbar={
          canEdit ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setUploading(true);
              }}
            >
              <UploadIcon className="h-4 w-4" />
              Subir archivos
            </Button>
          ) : undefined
        }
        empty="Todavía no hay archivos en esta propiedad."
      />
      {uploading && (
        <UploadDialog
          propertyId={propertyId}
          onClose={() => {
            setUploading(false);
            router.refresh();
          }}
        />
      )}
      {renaming !== undefined && (
        <RenameDialog
          propertyId={propertyId}
          attachment={renaming}
          onClose={() => {
            setRenaming(undefined);
          }}
        />
      )}
      <ConfirmActionDialog
        copy={
          deleting === undefined
            ? undefined
            : {
                title: 'Borrar el archivo',
                description: `Se quita "${deleting.name}" de la ficha.`,
                confirm: 'Borrar',
                done: 'Archivo borrado.',
                destructive: true,
              }
        }
        run={() => deletePropertyAttachmentAction(propertyId, { attachmentId: deleting?.id ?? '' })}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      />
    </>
  );
}

function UploadDialog({
  propertyId,
  onClose,
}: {
  readonly propertyId: string;
  readonly onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<readonly string[]>([]);

  function upload(files: readonly File[]) {
    setErrors([]);
    startTransition(async () => {
      const failed: string[] = [];
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
          failed.push(`${file.name}: pesa más de 25 MB.`);
          continue;
        }
        const form = new FormData();
        form.set('propertyId', propertyId);
        form.set('file', file);
        const error = await runAction(() => uploadPropertyAttachmentAction(form));
        if (error !== undefined) failed.push(`${file.name}: ${error}`);
      }
      setErrors(failed);
      if (failed.length === 0) {
        toast.success(files.length === 1 ? 'Archivo subido.' : 'Archivos subidos.');
        onClose();
      }
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir archivos</DialogTitle>
          <DialogDescription>
            Escrituras, reglamentos, planos en PDF: PDF, imágenes, Word o Excel de hasta 25 MB.
          </DialogDescription>
        </DialogHeader>
        {errors.map((error) => (
          <FormAlert key={error} message={error} />
        ))}
        <FileDropzone
          multiple
          accept={ATTACHMENT_UPLOAD_ACCEPT}
          disabled={pending}
          onFiles={upload}
        />
        {pending && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Subiendo…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  propertyId,
  attachment,
  onClose,
}: {
  readonly propertyId: string;
  readonly attachment: PropertyAttachmentRow;
  readonly onClose: () => void;
}) {
  const [name, setName] = useState(attachment.name);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renombrar el archivo</DialogTitle>
        </DialogHeader>
        <FormAlert message={error} />
        <Input
          aria-label="Nombre"
          value={name}
          maxLength={150}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            disabled={pending || name.trim() === ''}
            onClick={() => {
              startTransition(async () => {
                const failure = await runAction(() =>
                  updatePropertyAttachmentAction(propertyId, {
                    attachmentId: attachment.id,
                    name: name.trim(),
                  }),
                );
                if (failure !== undefined) {
                  setError(failure);
                  return;
                }
                toast.success('Archivo renombrado.');
                onClose();
              });
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
