'use client';

import { MAX_FEATURE_PER_REQUEST } from '@norde/core/clients/contracts';
import {
  MAX_COMPARE,
  MIN_COMPARE,
  PROPERTY_EXPORT_FORMATS,
  type PropertyExportFormat,
  type PropertySelection,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import { toast } from '@norde/ui/components/sonner';
import type { DataTableSelection } from '@norde/ui/lib/data-table-selection';
import { ColumnsIcon, DownloadIcon, PencilIcon, StarIcon, UserPlusIcon } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { FeatureToClientDialog } from '../../clients/components/feature-to-client-dialog';
import { setPropertyFavoritesAction } from '../actions';
import { EXPORT_FORMAT_LABELS } from '../labels';
import type { PropertyFilterValues } from './properties-toolbar';
import { QuickEditDialog } from './quick-edit-dialog';

export interface BulkPermissions {
  readonly bulkEdit: boolean;
  readonly changeProducer: boolean;
  readonly markAvailable: boolean;
  /** `properties:export` o `properties:export-bulk`: el caso de uso decide según la cantidad. */
  readonly export: boolean;
  /** Editar contactos: destacarles propiedades (#11). */
  readonly featureToClient: boolean;
}

/** La selección de la grilla como la espera el contract: los IDs, o los filtros de la URL. */
export function toPropertySelection(
  selection: DataTableSelection,
  filters: PropertyFilterValues,
): PropertySelection {
  if (selection.kind === 'ids') return { kind: 'ids', ids: [...selection.ids] };
  const filter = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
  return { kind: 'filter', filter };
}

const ATTACHMENT_NAME = /filename="([^"]+)"/;

/** Pide la exportación y la descarga. Un error esperado vuelve como JSON con su mensaje. */
async function download(format: PropertyExportFormat, selection: PropertySelection) {
  const response = await fetch('/propiedades/exportar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, selection }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : UNEXPECTED_ERROR_MESSAGE;
    throw new Error(message);
  }
  const name =
    ATTACHMENT_NAME.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
    `propiedades.${format}`;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Acciones sobre las propiedades marcadas o sobre todas las que cumplen los filtros. */
export function PropertyBulkActions({
  selection,
  count,
  filters,
  permissions,
}: {
  readonly selection: DataTableSelection;
  readonly count: number;
  readonly filters: PropertyFilterValues;
  readonly permissions: BulkPermissions;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [featuring, setFeaturing] = useState(false);
  const [pending, startTransition] = useTransition();
  const target = toPropertySelection(selection, filters);
  const ids = selection.kind === 'ids' ? selection.ids : [];
  const canCompare = ids.length >= MIN_COMPARE && ids.length <= MAX_COMPARE;

  function exportAs(format: PropertyExportFormat) {
    startTransition(async () => {
      const id = toast.loading(`Preparando ${EXPORT_FORMAT_LABELS[format]}…`);
      try {
        await download(format, target);
        toast.success('Exportación lista', { id });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : UNEXPECTED_ERROR_MESSAGE, { id });
      }
    });
  }

  function markFavorites() {
    startTransition(async () => {
      const message = await runAction(() => setPropertyFavoritesAction({ ids, favorite: true }));
      if (message === undefined) toast.success('Agregadas a tus favoritas');
      else toast.error(message);
    });
  }

  return (
    <>
      {permissions.export && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={pending}>
              <DownloadIcon className="h-4 w-4" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PROPERTY_EXPORT_FORMATS.map((format) => (
              <DropdownMenuItem
                key={format}
                onSelect={() => {
                  exportAs(format);
                }}
              >
                {EXPORT_FORMAT_LABELS[format]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || selection.kind === 'filter'}
        title={
          selection.kind === 'filter' ? 'Los favoritos se marcan sobre las de la página' : undefined
        }
        onClick={markFavorites}
      >
        <StarIcon className="h-4 w-4" />
        Favoritas
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canCompare}
        title={canCompare ? undefined : `Marcá de ${MIN_COMPARE} a ${MAX_COMPARE} propiedades`}
        onClick={() => {
          // Misma sección con otros query params: typedRoutes no puede verificar un string armado.
          router.push(`/propiedades/comparar?ids=${ids.join(',')}` as Route);
        }}
      >
        <ColumnsIcon className="h-4 w-4" />
        Comparar
      </Button>
      {permissions.featureToClient && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selection.kind === 'filter' || ids.length > MAX_FEATURE_PER_REQUEST}
          title={
            selection.kind === 'filter' || ids.length > MAX_FEATURE_PER_REQUEST
              ? `Marcá hasta ${MAX_FEATURE_PER_REQUEST.toLocaleString('es-AR')} propiedades de la página`
              : undefined
          }
          onClick={() => {
            setFeaturing(true);
          }}
        >
          <UserPlusIcon className="h-4 w-4" />
          Destacar a un contacto
        </Button>
      )}
      {permissions.bulkEdit && (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(true);
          }}
        >
          <PencilIcon className="h-4 w-4" />
          Edición rápida
        </Button>
      )}
      {featuring && (
        <FeatureToClientDialog
          propertyIds={ids}
          subject={
            ids.length === 1 ? 'la propiedad' : `${ids.length.toLocaleString('es-AR')} propiedades`
          }
          open={featuring}
          onOpenChange={setFeaturing}
        />
      )}
      <QuickEditDialog
        open={editing}
        onOpenChange={setEditing}
        selection={target}
        count={count}
        permissions={permissions}
      />
    </>
  );
}
