'use client';

import {
  CLIENT_KIND_LABELS,
  CLIENT_TYPE_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  type ClientDetail,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@norde/ui/components/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { toast } from '@norde/ui/components/sonner';
import { SoftBadge, StatusPill } from '@norde/ui/components/status-pill';
import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import {
  ArchiveRestoreIcon,
  ChevronDownIcon,
  CombineIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  ShieldAlertIcon,
  TagsIcon,
  Trash2Icon,
  UserCogIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { runAction } from '../../../lib/action-result';
import { formatDateTime } from '../../../lib/format';
import { loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { FormAlert } from '../../shared/components/form-alert';
import { deleteClientAction, reassignClientAction, restoreClientAction } from '../actions';
import { clientName, formatPhone, userName, whatsappHref } from '../client-format';
import { ClientEraseDialog } from './client-erase-dialog';
import { ClientFavoriteToggle } from './client-favorite-toggle';
import { ClientMergeDialog } from './client-merge-dialog';
import { TagList } from '../../shared/components/tags-dialog';
import { ClientTagsDialog } from './client-tags-dialog';
import { ContactInitials } from './contact-initials';
import {
  OpportunityActionsMenu,
  type OpportunityCatalogView,
} from '../../opportunities/components/opportunity-actions';
import { OpportunityStagePill } from '../../opportunities/components/opportunity-stage-pill';

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

/** Elegir otro agente responsable. */
function ReassignDialog({
  detail,
  open,
  onOpenChange,
}: {
  readonly detail: ClientDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [agentId, setAgentId] = useState<string | undefined>(detail.agent?.id);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle icon={UserCogIcon}>Cambiar el agente</DialogTitle>
          <DialogDescription>
            {clientName(detail.name)} pasa a estar a cargo del agente que elijas, y a su sucursal.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <EntityPicker
          value={agentId}
          initial={
            detail.agent === undefined
              ? undefined
              : { value: detail.agent.id, label: userName(detail.agent) }
          }
          onChange={setAgentId}
          loadPage={loadUserOptions}
          placeholder="Sin agente"
          searchPlaceholder="Buscar agente"
          clearLabel="Dejarlo sin agente"
        />
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
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(undefined);
              startTransition(async () => {
                const message = await runAction(() =>
                  reassignClientAction({ clientId: detail.id, agentId: agentId ?? null }),
                );
                if (message !== undefined) {
                  setError(message);
                  return;
                }
                toast.success('Agente actualizado');
                onOpenChange(false);
              });
            }}
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
 * La tarjeta de la ficha: nombre, tipos, agente y los datos de contacto principales, con las
 * acciones rápidas (cambiar el estado de la oportunidad, WhatsApp, llamar, email) y el menú
 * "Acciones" con las de la ficha (etiquetas, cambiar agente, unificar, borrar y suprimir los
 * datos). Las etiquetas se ven debajo de los botones.
 */
export function ClientDetailHeader({
  detail,
  canPickAgents,
  favorite,
  opportunityCatalog,
}: {
  readonly detail: ClientDetail;
  /** Elegir agente pide ver los usuarios (`users:read`). */
  readonly canPickAgents: boolean;
  /** Es favorito de quien mira la ficha. */
  readonly favorite: boolean;
  /** Para cambiar el estado o cerrar la oportunidad abierta; sin él, la tarjeta solo la muestra. */
  readonly opportunityCatalog: OpportunityCatalogView | undefined;
}) {
  const [pending, setPending] = useState<PendingAction | undefined>();
  const [reassigning, setReassigning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [tagging, setTagging] = useState(false);
  const inTrash = detail.deletedAt !== undefined;
  const phone = detail.phones[0];
  const email = detail.emails[0];
  const mobile = detail.phones.find((entry) => entry.kind === 'mobile') ?? phone;
  const name = clientName(detail.name);
  const canReassign = detail.can.reassign && canPickAgents;
  const canTrash = detail.can.delete && !inTrash;
  const hasMenu =
    detail.can.edit || canReassign || detail.can.merge || canTrash || detail.can.erase;

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-linear-to-br from-entity-header-from to-entity-header-to p-4 text-white sm:p-5">
      {inTrash && (
        <p
          role="status"
          className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-entity-header-muted"
        >
          Está en la papelera desde el {formatDateTime(detail.deletedAt)}, la mandó{' '}
          {userName(detail.deletedBy)}. Restauralo para editarlo.
        </p>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
          <ContactInitials
            name={name}
            className="size-16 rounded-xl bg-primary-500 text-xl text-white"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold !text-white">{name}</h1>
              <span className="rounded-lg bg-white/10 p-0.5">
                <ClientFavoriteToggle clientId={detail.id} favorite={favorite} />
              </span>
              {detail.activeOpportunity !== undefined && (
                <OpportunityStagePill
                  stage={detail.activeOpportunity.stage}
                  status={detail.activeOpportunity.status}
                />
              )}
              {detail.kind !== 'person' && <SoftBadge>{CLIENT_KIND_LABELS[detail.kind]}</SoftBadge>}
              {inTrash && <StatusPill tone="gray">En la papelera</StatusPill>}
            </div>
            {detail.clientTypes.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Tipos de cliente">
                {detail.clientTypes.map((type) => (
                  <li key={type}>
                    <StatusPill tone="green">{CLIENT_TYPE_LABELS[type]}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-entity-header-muted">Agente</dt>
              <dd className="font-medium">
                {detail.agent === undefined ? 'Sin agente' : userName(detail.agent)}
              </dd>
              {phone !== undefined && (
                <>
                  <dt className="text-entity-header-muted">Teléfono</dt>
                  <dd className="inline-flex items-center gap-1 tabular-nums">
                    {detail.contactMasked && <LockIcon className="h-3 w-3" aria-hidden />}
                    {detail.contactMasked ? phone.number : formatPhone(phone.number)}
                  </dd>
                </>
              )}
              {email !== undefined && (
                <>
                  <dt className="text-entity-header-muted">Email</dt>
                  <dd className="truncate">{email.address}</dd>
                </>
              )}
              <dt className="text-entity-header-muted">Oportunidad</dt>
              <dd>
                {detail.activeOpportunity === undefined ? (
                  <span className="text-entity-header-muted">Sin oportunidades abiertas</span>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {OPPORTUNITY_TYPE_LABELS[detail.activeOpportunity.type] ??
                        detail.activeOpportunity.type}
                    </span>
                    {detail.activeOpportunity.openCount > 1 && (
                      <Link
                        // Misma ficha con otra pestaña: typedRoutes no verifica un string armado.
                        href={`/contactos/${detail.id}?tab=oportunidades` as Route}
                        scroll={false}
                        className="text-xs font-medium text-white underline-offset-2 hover:underline"
                      >
                        {detail.activeOpportunity.openCount.toLocaleString('es-AR')} abiertas
                      </Link>
                    )}
                  </span>
                )}
              </dd>
            </dl>
            {detail.contactMasked && (
              <p className="text-xs text-entity-header-muted">
                Es propietario: sus datos de contacto se ven con el permiso «Ver datos de
                propietarios».
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {opportunityCatalog !== undefined && detail.activeOpportunity !== undefined && (
              <OpportunityActionsMenu
                target={{
                  id: detail.activeOpportunity.id,
                  clientName: name,
                  agent: detail.activeOpportunity.agent,
                  can: detail.activeOpportunity.can,
                }}
                catalog={opportunityCatalog}
                canPickAgents={canPickAgents}
                variant="button"
              />
            )}
            {!detail.contactMasked && mobile !== undefined && (
              <Button asChild variant="outline" size="sm" className="text-foreground dark:bg-card">
                <a href={whatsappHref(mobile.number)} target="_blank" rel="noreferrer">
                  <WhatsAppIcon className="h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
            )}
            {!detail.contactMasked && phone !== undefined && (
              <Button asChild variant="outline" size="sm" className="text-foreground dark:bg-card">
                <a href={`tel:${phone.number}`}>
                  <PhoneIcon className="h-4 w-4" />
                  Llamar
                </a>
              </Button>
            )}
            {!detail.contactMasked && email !== undefined && (
              <Button asChild variant="outline" size="sm" className="text-foreground dark:bg-card">
                <a href={`mailto:${email.address}`}>
                  <MailIcon className="h-4 w-4" />
                  Email
                </a>
              </Button>
            )}
            {detail.can.delete && inTrash && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setPending({
                    copy: {
                      title: 'Restaurar contacto',
                      description: `${name} vuelve a la agenda.`,
                      confirm: 'Restaurar',
                      done: 'Contacto restaurado',
                    },
                    run: () => restoreClientAction({ clientId: detail.id }),
                  });
                }}
              >
                <ArchiveRestoreIcon className="h-4 w-4" />
                Restaurar
              </Button>
            )}
            {hasMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-foreground dark:bg-card"
                  >
                    Acciones
                    <ChevronDownIcon className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {detail.can.edit && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setTagging(true);
                      }}
                    >
                      <TagsIcon />
                      Gestionar etiquetas
                    </DropdownMenuItem>
                  )}
                  {canReassign && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setReassigning(true);
                      }}
                    >
                      <UserCogIcon />
                      Cambiar agente
                    </DropdownMenuItem>
                  )}
                  {detail.can.merge && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setMerging(true);
                      }}
                    >
                      <CombineIcon />
                      Unificar
                    </DropdownMenuItem>
                  )}
                  {(detail.can.edit || canReassign || detail.can.merge) &&
                    (canTrash || detail.can.erase) && <DropdownMenuSeparator />}
                  {canTrash && (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setPending({
                          copy: {
                            title: 'Borrar contacto',
                            description: `${name} va a la papelera; desde ahí lo podés restaurar.`,
                            confirm: 'Borrar',
                            done: 'Contacto enviado a la papelera',
                            destructive: true,
                          },
                          run: () => deleteClientAction({ clientId: detail.id }),
                        });
                      }}
                    >
                      <Trash2Icon />
                      Borrar
                    </DropdownMenuItem>
                  )}
                  {detail.can.erase && (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setErasing(true);
                      }}
                    >
                      <ShieldAlertIcon />
                      Suprimir datos
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <TagList tags={detail.tags} onDark className="lg:justify-end" />
        </div>
      </div>

      <ConfirmActionDialog
        copy={pending?.copy}
        run={pending?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
      />
      {reassigning && (
        <ReassignDialog detail={detail} open={reassigning} onOpenChange={setReassigning} />
      )}
      {tagging && <ClientTagsDialog detail={detail} open={tagging} onOpenChange={setTagging} />}
      {detail.can.merge && (
        <ClientMergeDialog detail={detail} open={merging} onOpenChange={setMerging} />
      )}
      {detail.can.erase && (
        <ClientEraseDialog detail={detail} open={erasing} onOpenChange={setErasing} />
      )}
    </div>
  );
}
