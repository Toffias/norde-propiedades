'use client';

import {
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPE_VALUES,
  type InquiryClientMatch,
  type InquiryInboxRow,
  type OpportunityTypeValue,
} from '@norde/core/clients/contracts';
import type { Page } from '@norde/core/shared';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { SoftBadge } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, UserPlusIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useId, useState, useTransition } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatDate } from '../../../lib/format';
import { userName } from '../../clients/client-format';
import { loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { FormAlert } from '../../shared/components/form-alert';
import { assignInquiryAction, loadInquiryMatchesAction } from '../actions';

/** Pocas por página: entran en el diálogo sin scroll en un celular. */
const MATCHES_PAGE_SIZE = 5;

/** "Crear cliente nuevo"; si no, el destino es el ID del contacto elegido. */
const NEW_CLIENT = 'new';

type Matches =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'loaded'; readonly page: Page<InquiryClientMatch> };

function matchedBy(match: InquiryClientMatch): string {
  if (match.matchedByPhone && match.matchedByEmail) return 'Mismo teléfono y email';
  return match.matchedByPhone ? 'Mismo teléfono' : 'Mismo email';
}

function MatchOption({
  match,
  name,
  checked,
  onSelect,
}: {
  readonly match: InquiryClientMatch;
  readonly name: string;
  readonly checked: boolean;
  readonly onSelect: () => void;
}) {
  const id = useId();
  return (
    <li>
      <label
        htmlFor={id}
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 text-sm transition-colors hover:bg-accent',
          checked && 'border-foreground/40 bg-accent',
        )}
      >
        <input
          id={id}
          type="radio"
          name={name}
          checked={checked}
          onChange={onSelect}
          className="mt-1 accent-foreground"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{match.name ?? 'Sin nombre'}</span>
            <SoftBadge>{matchedBy(match)}</SoftBadge>
            {match.deleted && <SoftBadge>En la papelera</SoftBadge>}
          </span>
          <span className="text-xs text-muted-foreground">
            Agente: {userName(match.agent)} · Alta: {formatDate(match.createdAt)}
            {match.lastContactAt !== undefined &&
              ` · Último contacto: ${formatDate(match.lastContactAt)}`}
          </span>
          {match.viewable && (
            <Link
              href={`/contactos/${match.id}` as Route}
              target="_blank"
              className="w-fit text-xs underline-offset-2 hover:underline"
            >
              Ver la ficha
            </Link>
          )}
        </span>
      </label>
    </li>
  );
}

/**
 * "Asignar a este cliente" o "Crear cliente nuevo": las coincidencias por teléfono o email,
 * paginadas en el servidor, el agente a cargo y el tipo de oportunidad.
 */
export function AssignInquiryDialog({
  row,
  pickAgents,
  onOpenChange,
}: {
  /** Se monta con `key={row.id}`: cada consulta arranca de cero. */
  readonly row: InquiryInboxRow;
  /** Elegir el agente (`users:read`); sin el permiso queda el que corresponde. */
  readonly pickAgents: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [page, setPage] = useState(1);
  const [matches, setMatches] = useState<Matches>({ state: 'loading' });
  const [target, setTarget] = useState<string | undefined>();
  const [agentId, setAgentId] = useState<string | undefined>();
  const [type, setType] = useState<OpportunityTypeValue>(row.suggestedType);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const inquiryId = row.id;

  useEffect(() => {
    let current = true;
    loadInquiryMatchesAction({ inquiryId, page, pageSize: MATCHES_PAGE_SIZE })
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          setMatches({ state: 'failed', message: result.message });
          return;
        }
        setMatches({ state: 'loaded', page: result.value });
        // Sin coincidencias, el único camino es un cliente nuevo; con, la más parecida.
        setTarget((chosen) => chosen ?? result.value.items[0]?.id ?? NEW_CLIENT);
      })
      .catch(() => {
        if (current) setMatches({ state: 'failed', message: UNEXPECTED_ERROR_MESSAGE });
      });
    return () => {
      current = false;
    };
  }, [inquiryId, page]);

  function goTo(next: number) {
    setPage(next);
    setMatches({ state: 'loading' });
  }

  function submit() {
    if (target === undefined) return;
    startTransition(async () => {
      try {
        const result = await assignInquiryAction({
          inquiryId: row.id,
          target: target === NEW_CLIENT ? { kind: 'new' } : { kind: 'client', clientId: target },
          type,
          ...(agentId === undefined ? {} : { agentId }),
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        toast.success(
          result.value.clientCreated
            ? 'Consulta asignada a un contacto nuevo'
            : 'Consulta asignada',
        );
        onOpenChange(false);
      } catch {
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  const loaded = matches.state === 'loaded' ? matches.page : undefined;
  const chosen = loaded?.items.find((match) => match.id === target);
  const lastPage =
    loaded === undefined ? 1 : Math.max(1, Math.ceil(loaded.total / MATCHES_PAGE_SIZE));
  const agentPlaceholder =
    target === NEW_CLIENT
      ? 'Vos, que la asignás'
      : chosen?.agent === undefined
        ? 'El agente del contacto'
        : `${userName(chosen.agent)}, el agente del contacto`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar consulta</DialogTitle>
          <DialogDescription>
            {row.senderName ?? 'Sin nombre'}: elegí el contacto al que corresponde. Se abre una
            oportunidad o se suma a la que ya tiene por la misma propiedad.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {matches.state === 'loading' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
              Buscando contactos con el mismo teléfono o email…
            </p>
          )}
          {matches.state === 'failed' && <FormAlert message={matches.message} />}
          {loaded?.total === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
              <UserPlusIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="font-medium">Crear cliente nuevo.</span> No hay contactos con este
                teléfono ni este email: se crea uno con los datos de la consulta.
              </span>
            </div>
          )}
          {loaded !== undefined && loaded.total > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">
                {loaded.total === 1
                  ? 'Hay un contacto con el mismo teléfono o email'
                  : `Hay ${String(loaded.total)} contactos con el mismo teléfono o email`}
              </legend>
              <ul className="flex flex-col gap-2">
                {loaded.items.map((match) => (
                  <MatchOption
                    key={match.id}
                    match={match}
                    name={`${id}-target`}
                    checked={target === match.id}
                    onSelect={() => {
                      setTarget(match.id);
                    }}
                  />
                ))}
              </ul>
              {lastPage > 1 && (
                <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span>
                    Página {page} de {lastPage}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Contactos anteriores"
                    disabled={page <= 1}
                    onClick={() => {
                      goTo(page - 1);
                    }}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Contactos siguientes"
                    disabled={page >= lastPage}
                    onClick={() => {
                      goTo(page + 1);
                    }}
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                No se crea otro contacto con los mismos datos: si no es ninguno de estos, revisá el
                teléfono o el email en su ficha.
              </p>
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {pickAgents && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-agent`} className="text-xs">
                  Agente a cargo
                </Label>
                <EntityPicker
                  id={`${id}-agent`}
                  value={agentId}
                  initial={undefined}
                  onChange={setAgentId}
                  loadPage={loadUserOptions}
                  placeholder={agentPlaceholder}
                  searchPlaceholder="Buscar usuario"
                  clearLabel="Dejar el que corresponde"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-type`} className="text-xs">
                Busca
              </Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  const next = OPPORTUNITY_TYPE_VALUES.find((t) => t === value);
                  if (next !== undefined) setType(next);
                }}
              >
                <SelectTrigger id={`${id}-type`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPPORTUNITY_TYPE_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {OPPORTUNITY_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <FormAlert message={error} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending || target === undefined} onClick={submit}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {target === NEW_CLIENT ? 'Crear cliente y asignar' : 'Asignar a este cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
