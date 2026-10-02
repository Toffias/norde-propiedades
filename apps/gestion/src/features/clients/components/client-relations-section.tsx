'use client';

import {
  CLIENT_KIND_LABELS,
  type ClientDetail,
  type ClientKindValue,
  type ClientRelationKindValue,
  type ClientRelationRow,
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
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { SectionCard } from '@norde/ui/components/section-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, PlusIcon, XIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useId, useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { EntityPicker } from '../../identity/components/entity-picker';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { FormAlert } from '../../shared/components/form-alert';
import { linkClientsAction, loadClientOptions, unlinkClientsAction } from '../actions';
import { clientName } from '../client-format';

/** Cómo se lee la relación desde la ficha que se está viendo. */
function relationLabel(row: ClientRelationRow): string {
  const base = (() => {
    switch (row.kind) {
      case 'works_at':
        return row.direction === 'outgoing' ? 'Trabaja en' : 'Trabaja en esta empresa';
      case 'member_of':
        return row.direction === 'outgoing' ? 'Es miembro de' : 'Miembro de este grupo';
      case 'related':
        return 'Relacionado';
    }
  })();
  return row.label === undefined ? base : `${base} · ${row.label}`;
}

interface RelationOption {
  readonly kind: ClientRelationKindValue;
  readonly label: string;
  /** Qué tipo de registro puede ser el otro contacto. */
  readonly target: ClientKindValue | undefined;
  readonly placeholder: string;
}

/** Las relaciones que puede declarar cada tipo de registro (las reglas las valida el dominio). */
function relationOptions(kind: ClientKindValue): readonly RelationOption[] {
  const related: RelationOption = {
    kind: 'related',
    label: 'Relacionado con',
    target: undefined,
    placeholder: 'Elegí el contacto',
  };
  const memberOf: RelationOption = {
    kind: 'member_of',
    label: 'Es miembro del grupo',
    target: 'group',
    placeholder: 'Elegí el grupo',
  };
  switch (kind) {
    case 'person':
      return [
        {
          kind: 'works_at',
          label: 'Trabaja en la empresa',
          target: 'company',
          placeholder: 'Elegí la empresa',
        },
        memberOf,
        related,
      ];
    case 'company':
      return [memberOf, related];
    case 'group':
      return [related];
  }
}

function pageHref(clientId: string, page: number): Route {
  // Misma ficha con otra página de relaciones: typedRoutes no verifica un string armado.
  return `/contactos/${clientId}${page === 1 ? '' : `?relPage=${String(page)}`}` as Route;
}

function AddRelationDialog({
  detail,
  open,
  onOpenChange,
}: {
  readonly detail: ClientDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const options = relationOptions(detail.kind);
  const [kind, setKind] = useState<ClientRelationKindValue>(options[0]?.kind ?? 'related');
  const [relatedId, setRelatedId] = useState<string | undefined>();
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const option = options.find((o) => o.kind === kind) ?? options[0];

  function close() {
    setRelatedId(undefined);
    setLabel('');
    setError(undefined);
    onOpenChange(false);
  }

  function save() {
    if (relatedId === undefined) return;
    startTransition(async () => {
      const message = await runAction(() =>
        linkClientsAction({
          clientId: detail.id,
          relatedClientId: relatedId,
          kind,
          ...(label.trim() === '' ? {} : { label: label.trim() }),
        }),
      );
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success('Relación guardada.');
      close();
    });
  }

  const target = option?.target;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar contacto relacionado</DialogTitle>
          <DialogDescription>
            {CLIENT_KIND_LABELS[detail.kind]} {clientName(detail.name)}: elegí la relación y el
            contacto.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-kind`}>Relación</Label>
            <Select
              value={kind}
              onValueChange={(next) => {
                const found = options.find((o) => o.kind === next);
                if (found) setKind(found.kind);
                setRelatedId(undefined);
              }}
            >
              <SelectTrigger id={`${id}-kind`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.kind} value={o.kind}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-related`}>Contacto</Label>
            <EntityPicker
              // Cambiar de relación reinicia el selector (otro tipo de registro).
              key={kind}
              id={`${id}-related`}
              value={relatedId}
              initial={undefined}
              onChange={setRelatedId}
              loadPage={(search, page) => loadClientOptions(search, page, target)}
              placeholder={option?.placeholder ?? 'Elegí el contacto'}
              searchPlaceholder="Buscar por nombre, teléfono o email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-label`}>Detalle (opcional)</Label>
            <Input
              id={`${id}-label`}
              maxLength={60}
              placeholder={kind === 'works_at' ? 'Gerente, socio…' : 'Esposa, contador…'}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending || relatedId === undefined || relatedId === detail.id}
            onClick={save}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Contactos relacionados: empresas y grupos a los que pertenece, quiénes pertenecen a esta empresa
 * o grupo, y otros contactos relacionados. Paginado en el servidor (`?relPage=`).
 */
export function ClientRelationsSection({
  detail,
  page,
}: {
  readonly detail: ClientDetail;
  readonly page: Page<ClientRelationRow> | undefined;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<
    { readonly copy: ConfirmActionCopy; readonly run: () => Promise<ActionResult> } | undefined
  >();
  const pages = page === undefined ? 1 : Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <SectionCard
      title="Contactos relacionados"
      className="lg:col-span-2"
      {...(detail.can.edit
        ? {
            action: (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(true);
                }}
              >
                <PlusIcon className="h-4 w-4" />
                Agregar
              </Button>
            ),
          }
        : {})}
    >
      {page === undefined ? (
        <p className="text-sm text-muted-foreground">No se pudieron cargar las relaciones.</p>
      ) : page.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {detail.kind === 'person'
            ? 'Sin empresas, grupos ni contactos relacionados.'
            : 'Nadie relacionado todavía.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-border">
            {page.items.map((row) => (
              <li
                key={`${row.direction}-${row.kind}-${row.other.id}`}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted-foreground">{relationLabel(row)}</span>
                  {row.canOpen ? (
                    <Link
                      href={`/contactos/${row.other.id}` as Route}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {clientName(row.other.name)}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium">
                      {clientName(row.other.name)}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {CLIENT_KIND_LABELS[row.other.kind]}
                  </span>
                </div>
                {row.canUnlink && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar la relación con ${clientName(row.other.name)}`}
                    onClick={() => {
                      const outgoing = row.direction === 'outgoing';
                      setPending({
                        copy: {
                          title: 'Quitar relación',
                          description: `Se quita «${relationLabel(row)}» con ${clientName(row.other.name)}. Los dos contactos siguen en la agenda.`,
                          confirm: 'Quitar',
                          done: 'Relación quitada.',
                          destructive: true,
                        },
                        run: () =>
                          unlinkClientsAction({
                            clientId: outgoing ? detail.id : row.other.id,
                            relatedClientId: outgoing ? row.other.id : detail.id,
                            kind: row.kind,
                          }),
                      });
                    }}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav
              aria-label="Páginas de contactos relacionados"
              className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
            >
              <span>
                Página {page.page} de {pages} · {page.total.toLocaleString('es-AR')} relaciones
              </span>
              <div className="flex gap-1">
                <Button
                  asChild={page.page > 1}
                  size="icon"
                  variant="outline"
                  disabled={page.page <= 1}
                  aria-label="Página anterior"
                >
                  {page.page > 1 ? (
                    <Link href={pageHref(detail.id, page.page - 1)} scroll={false}>
                      <ChevronLeftIcon className="h-4 w-4" />
                    </Link>
                  ) : (
                    <ChevronLeftIcon className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  asChild={page.page < pages}
                  size="icon"
                  variant="outline"
                  disabled={page.page >= pages}
                  aria-label="Página siguiente"
                >
                  {page.page < pages ? (
                    <Link href={pageHref(detail.id, page.page + 1)} scroll={false}>
                      <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </nav>
          )}
        </div>
      )}
      {detail.can.edit && (
        <AddRelationDialog detail={detail} open={adding} onOpenChange={setAdding} />
      )}
      <ConfirmActionDialog
        copy={pending?.copy}
        run={pending?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
      />
    </SectionCard>
  );
}
