'use client';

import {
  CLIENT_KIND_LABELS,
  type ClientDetail,
  type ClientMergePreview,
  type ClientMergeSide,
  type ClientRecordCountsDto,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { Label } from '@norde/ui/components/label';
import { toast } from '@norde/ui/components/sonner';
import { cn } from '@norde/ui/lib/utils';
import { Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { EntityPicker } from '../../identity/components/entity-picker';
import { FormAlert } from '../../shared/components/form-alert';
import { loadClientOptions, mergeClientsAction, previewClientMergeAction } from '../actions';
import { clientName, formatPhone, userName } from '../client-format';

const RECORD_LABELS: readonly [keyof ClientRecordCountsDto, string, string][] = [
  ['opportunities', 'oportunidad', 'oportunidades'],
  ['activities', 'actividad', 'actividades'],
  ['savedSearches', 'búsqueda guardada', 'búsquedas guardadas'],
  ['featuredListings', 'propiedad destacada', 'propiedades destacadas'],
  ['sharedListings', 'envío', 'envíos'],
  ['inquiries', 'consulta', 'consultas'],
];

function recordSummary(side: ClientMergeSide): string {
  const parts = RECORD_LABELS.flatMap(([field, one, many]) => {
    const count = side.records[field];
    return count === 0 ? [] : [`${count.toLocaleString('es-AR')} ${count === 1 ? one : many}`];
  });
  if (side.tagCount > 0) parts.push(`${String(side.tagCount)} etiquetas`);
  if (side.relationCount > 0) parts.push(`${String(side.relationCount)} relaciones`);
  return parts.length === 0 ? 'Nada más cargado.' : parts.join(' · ');
}

function SideCard({
  side,
  primary,
  onChoose,
  name,
}: {
  readonly side: ClientMergeSide;
  readonly primary: boolean;
  readonly onChoose: () => void;
  readonly name: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-sm transition-colors',
        primary ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          id={id}
          type="radio"
          name={name}
          checked={primary}
          onChange={onChoose}
          className="accent-primary"
        />
        <span className="text-xs font-medium text-muted-foreground">
          {primary ? 'Queda este (principal)' : 'Se absorbe y va a la papelera'}
        </span>
      </span>
      <span className="text-base font-semibold">{clientName(side.name)}</span>
      <span className="text-xs text-muted-foreground">
        {CLIENT_KIND_LABELS[side.kind]} · alta {formatDateTime(side.createdAt)} · agente{' '}
        {side.agent === undefined ? 'sin agente' : userName(side.agent)}
      </span>
      {side.phones.length > 0 && (
        <span className="tabular-nums">{side.phones.map(formatPhone).join(' · ')}</span>
      )}
      {side.emails.length > 0 && <span className="break-all">{side.emails.join(' · ')}</span>}
      <span className="text-xs text-muted-foreground">{recordSummary(side)}</span>
    </label>
  );
}

/**
 * Unificar un duplicado: elegir el otro contacto, ver los dos lado a lado y elegir cuál queda. Todo
 * lo del otro (teléfonos, emails, canales, etiquetas, relaciones, oportunidades y actividad) pasa
 * al principal; el otro queda vacío en la papelera.
 */
export function ClientMergeDialog({
  detail,
  open,
  onOpenChange,
}: {
  readonly detail: ClientDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const router = useRouter();
  const [otherId, setOtherId] = useState<string | undefined>();
  const [preview, setPreview] = useState<ClientMergePreview | undefined>();
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [loading, startLoading] = useTransition();
  const [merging, startMerging] = useTransition();

  function close() {
    setOtherId(undefined);
    setPreview(undefined);
    setKeepCurrent(true);
    setError(undefined);
    onOpenChange(false);
  }

  function choose(next: string | undefined) {
    setOtherId(next);
    setPreview(undefined);
    setError(undefined);
    if (next === undefined) return;
    if (next === detail.id) {
      setError('Elegí otro contacto: es el mismo que estás viendo.');
      return;
    }
    startLoading(async () => {
      try {
        const result = await previewClientMergeAction({ primaryId: detail.id, duplicateId: next });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setPreview(result.preview);
      } catch {
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  function merge() {
    if (preview === undefined) return;
    const [primary, duplicate] = keepCurrent
      ? [preview.primary, preview.duplicate]
      : [preview.duplicate, preview.primary];
    startMerging(async () => {
      try {
        const result = await mergeClientsAction({
          primaryId: primary.id,
          duplicateId: duplicate.id,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        toast.success(`Contactos unificados en ${clientName(primary.name)}`);
        close();
        if (primary.id !== detail.id) router.push(`/contactos/${primary.id}` as Route);
      } catch {
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Unificar contactos</DialogTitle>
          <DialogDescription>
            Si {clientName(detail.name)} está cargado dos veces, elegí el otro registro y cuál
            queda. No se pierde nada: lo del otro pasa al principal.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-other`}>El otro contacto</Label>
          <EntityPicker
            id={`${id}-other`}
            value={otherId}
            initial={undefined}
            onChange={choose}
            loadPage={loadClientOptions}
            placeholder="Buscalo por nombre, teléfono o email"
            searchPlaceholder="Buscar contacto"
          />
        </div>
        {loading && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Cargando los dos contactos…
          </p>
        )}
        {preview !== undefined && (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">¿Cuál queda?</legend>
            <SideCard
              side={preview.primary}
              primary={keepCurrent}
              name={`${id}-primary`}
              onChoose={() => {
                setKeepCurrent(true);
              }}
            />
            <SideCard
              side={preview.duplicate}
              primary={!keepCurrent}
              name={`${id}-primary`}
              onChoose={() => {
                setKeepCurrent(false);
              }}
            />
          </fieldset>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button type="button" disabled={preview === undefined || merging} onClick={merge}>
            {merging && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Unificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
