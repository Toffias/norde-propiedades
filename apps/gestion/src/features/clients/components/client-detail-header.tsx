'use client';

import {
  CLIENT_KIND_LABELS,
  CLIENT_TYPE_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  type ClientDetail,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
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
  CombineIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  ShieldAlertIcon,
  StickyNoteIcon,
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
import { NOTE_FIELD_ID } from './client-note-composer';
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
          <DialogTitle>Cambiar el agente</DialogTitle>
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
 * acciones rápidas (WhatsApp, llamar, email) y las de la ficha (cambiar agente, unificar, borrar,
 * restaurar y suprimir los datos).
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
  const inTrash = detail.deletedAt !== undefined;
  const phone = detail.phones[0];
  const email = detail.emails[0];
  const mobile = detail.phones.find((entry) => entry.kind === 'mobile') ?? phone;
  const name = clientName(detail.name);

  return (
    <Card className="gap-4 p-5">
      {inTrash && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          Está en la papelera desde el {formatDateTime(detail.deletedAt)}, la mandó{' '}
          {userName(detail.deletedBy)}. Restauralo para editarlo.
        </p>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{name}</h1>
            <ClientFavoriteToggle clientId={detail.id} favorite={favorite} />
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
            <dt className="text-muted-foreground">Agente</dt>
            <dd className="font-medium">
              {detail.agent === undefined ? 'Sin agente' : userName(detail.agent)}
            </dd>
            {phone !== undefined && (
              <>
                <dt className="text-muted-foreground">Teléfono</dt>
                <dd className="inline-flex items-center gap-1 tabular-nums">
                  {detail.contactMasked && <LockIcon className="h-3 w-3" aria-hidden />}
                  {detail.contactMasked ? phone.number : formatPhone(phone.number)}
                </dd>
              </>
            )}
            {email !== undefined && (
              <>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{email.address}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Oportunidad</dt>
            <dd>
              {detail.activeOpportunity === undefined ? (
                <span className="text-muted-foreground">Sin oportunidades abiertas</span>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {OPPORTUNITY_TYPE_LABELS[detail.activeOpportunity.type] ??
                      detail.activeOpportunity.type}
                  </span>
                  <OpportunityStagePill
                    stage={detail.activeOpportunity.stage}
                    status={detail.activeOpportunity.status}
                  />
                  {detail.activeOpportunity.openCount > 1 && (
                    <Link
                      // Misma ficha con otra pestaña: typedRoutes no verifica un string armado.
                      href={`/contactos/${detail.id}?tab=oportunidades` as Route}
                      scroll={false}
                      className="text-xs text-primary hover:underline"
                    >
                      {detail.activeOpportunity.openCount.toLocaleString('es-AR')} abiertas
                    </Link>
                  )}
                  {opportunityCatalog !== undefined && (
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
                </span>
              )}
            </dd>
          </dl>
          {detail.contactMasked && (
            <p className="text-xs text-muted-foreground">
              Es propietario: sus datos de contacto se ven con el permiso «Ver datos de
              propietarios».
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {detail.can.edit && (
            <Button asChild variant="outline" size="sm">
              <Link
                // La pestaña Actividad, con el foco en la nota: typedRoutes no verifica un string armado.
                href={`/contactos/${detail.id}?tab=actividad#${NOTE_FIELD_ID}` as Route}
                scroll={false}
              >
                <StickyNoteIcon className="h-4 w-4" />
                Agregar nota
              </Link>
            </Button>
          )}
          {!detail.contactMasked && mobile !== undefined && (
            <Button asChild variant="outline" size="sm">
              <a href={whatsappHref(mobile.number)} target="_blank" rel="noreferrer">
                <WhatsAppIcon className="h-4 w-4" />
                WhatsApp
              </a>
            </Button>
          )}
          {!detail.contactMasked && phone !== undefined && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${phone.number}`}>
                <PhoneIcon className="h-4 w-4" />
                Llamar
              </a>
            </Button>
          )}
          {!detail.contactMasked && email !== undefined && (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${email.address}`}>
                <MailIcon className="h-4 w-4" />
                Email
              </a>
            </Button>
          )}
          {detail.can.reassign && canPickAgents && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReassigning(true);
              }}
            >
              <UserCogIcon className="h-4 w-4" />
              Cambiar agente
            </Button>
          )}
          {detail.can.merge && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMerging(true);
              }}
            >
              <CombineIcon className="h-4 w-4" />
              Unificar
            </Button>
          )}
          {detail.can.delete &&
            (inTrash ? (
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
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => {
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
                <Trash2Icon className="h-4 w-4" />
                Borrar
              </Button>
            ))}
          {detail.can.erase && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                setErasing(true);
              }}
            >
              <ShieldAlertIcon className="h-4 w-4" />
              Suprimir datos
            </Button>
          )}
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
      {detail.can.merge && (
        <ClientMergeDialog detail={detail} open={merging} onOpenChange={setMerging} />
      )}
      {detail.can.erase && (
        <ClientEraseDialog detail={detail} open={erasing} onOpenChange={setErasing} />
      )}
    </Card>
  );
}
