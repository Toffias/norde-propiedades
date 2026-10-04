'use client';

import { MAX_FALLEN_REASON_LENGTH, type ReservationRow } from '@norde/core/properties/contracts';
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
import { Label } from '@norde/ui/components/label';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { Textarea } from '@norde/ui/components/textarea';
import { CalendarCheckIcon, Loader2Icon, PencilIcon, XCircleIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../../lib/action-result';
import { EMPTY_VALUE, formatDateOnly } from '../../../../lib/format';
import { ConfirmActionDialog } from '../../../shared/components/confirm-action-dialog';
import { FormAlert } from '../../../shared/components/form-alert';
import { OPERATION_LABELS, RESERVATION_STATUS_DISPLAY } from '../../labels';
import { fallReservationAction, signReservationAction } from '../../reservation-actions';
import { ReservationDialog, type ReservationSubject } from './reservation-dialog';
import { reservationAmount, reservationClient, reservationCommission } from './reservation-format';

/**
 * La reserva activa de la propiedad, debajo de la cabecera de la ficha. Quien gestiona reservas la
 * edita, la da por caída (la propiedad vuelve a estar disponible) o la firma (vendida o alquilada).
 */
export function ActiveReservationCard({
  reservation,
  subject,
  canManage,
}: {
  readonly reservation: ReservationRow;
  readonly subject: ReservationSubject;
  readonly canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [falling, setFalling] = useState(false);
  const [signing, setSigning] = useState(false);
  const status = RESERVATION_STATUS_DISPLAY[reservation.status];
  const signedStatus = reservation.operation === 'sale' ? 'vendida' : 'alquilada';

  const facts = [
    {
      label: 'Contacto',
      value: (
        <Link
          // La ficha del contacto: typedRoutes no verifica un segmento armado.
          href={`/contactos/${reservation.client.id}` as Route}
          className="font-medium hover:underline"
        >
          {reservationClient(reservation)}
        </Link>
      ),
    },
    { label: 'Operación', value: OPERATION_LABELS[reservation.operation] },
    { label: 'Valor', value: reservationAmount(reservation) },
    { label: 'Comisión', value: reservationCommission(reservation) },
    { label: 'Agente', value: reservation.agent?.name ?? EMPTY_VALUE },
    { label: 'Gerente', value: reservation.manager?.name ?? EMPTY_VALUE },
    { label: 'Firma estimada', value: formatDateOnly(reservation.estimatedSigningDate) },
  ];

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Reserva</h2>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              <PencilIcon className="h-4 w-4" />
              Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFalling(true);
              }}
            >
              <XCircleIcon className="h-4 w-4" />
              Dar por caída
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSigning(true);
              }}
            >
              <CalendarCheckIcon className="h-4 w-4" />
              Firmar
            </Button>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="min-w-0 break-words">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {reservation.notes !== undefined && (
        <p className="text-sm whitespace-pre-line text-muted-foreground">{reservation.notes}</p>
      )}

      {editing && (
        <ReservationDialog
          subject={subject}
          reservation={reservation}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
      <FallReservationDialog
        reservationId={reservation.id}
        open={falling}
        onOpenChange={setFalling}
      />
      <ConfirmActionDialog
        copy={
          signing
            ? {
                title: 'Firmar la reserva',
                description: `La propiedad pasa a ${signedStatus} y la reserva queda firmada. No se puede deshacer desde acá.`,
                confirm: 'Firmar',
                done: `Reserva firmada: la propiedad quedó ${signedStatus}`,
              }
            : undefined
        }
        run={() => signReservationAction({ reservationId: reservation.id })}
        onOpenChange={setSigning}
      />
    </Card>
  );
}

function FallReservationDialog({
  reservationId,
  open,
  onOpenChange,
}: {
  readonly reservationId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function close() {
    setReason('');
    setError(undefined);
    onOpenChange(false);
  }

  function fall() {
    startTransition(async () => {
      const message = await runAction(() =>
        fallReservationAction({
          reservationId,
          ...(reason.trim() === '' ? {} : { reason }),
        }),
      );
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success('Reserva caída: la propiedad vuelve a estar disponible');
      close();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar por caída la reserva</DialogTitle>
          <DialogDescription>
            La propiedad vuelve a estar disponible y la reserva queda en su historial.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-reason`}>Motivo (opcional)</Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            maxLength={MAX_FALLEN_REASON_LENGTH}
            rows={3}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={fall}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Dar por caída
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
