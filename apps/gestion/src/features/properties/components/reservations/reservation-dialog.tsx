'use client';

import {
  CURRENCIES,
  ReservePropertyInputSchema,
  type Operation,
  type ReservationRow,
  type ReservePropertyInput,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { runAction } from '../../../../lib/action-result';
import { contractResolver } from '../../../../lib/form';
import { loadClientOptions } from '../../../clients/actions';
import { EntityPicker } from '../../../identity/components/entity-picker';
import { loadUserOptions } from '../../../identity/actions';
import { FormAlert } from '../../../shared/components/form-alert';
import { SelectField, TextareaField, TextField } from '../../../shared/components/form-fields';
import { CURRENCY_LABELS, OPERATION_LABELS } from '../../labels';
import { reservePropertyAction, updateReservationAction } from '../../reservation-actions';
import { centsToAmount } from '../detail/sections-listing';

type Values = ReservePropertyInput;
type Valid = z.output<typeof ReservePropertyInputSchema>;

/** Lo que se reserva: la propiedad con sus operaciones, y el contacto si ya viene elegido. */
export interface ReservationSubject {
  readonly propertyId: string;
  /** "DEP0012": para los textos. */
  readonly code: string;
  readonly operations: readonly Operation[];
  /** Desde las destacadas de un contacto: el contacto y su oportunidad ya vienen dados. */
  readonly client?: { readonly id: string; readonly name: string } | undefined;
  readonly opportunityId?: string | undefined;
}

function defaults(subject: ReservationSubject, reservation: ReservationRow | undefined): Values {
  if (reservation !== undefined) {
    return {
      propertyId: subject.propertyId,
      clientId: reservation.client.id,
      operation: reservation.operation,
      agentUserId: reservation.agent?.id,
      managerUserId: reservation.manager?.id,
      amount: centsToAmount(reservation.amount?.amountCents),
      currency: reservation.amount?.currency,
      commissionPct: reservation.commissionPct?.toString().replace('.', ',') ?? '',
      commissionAmount: centsToAmount(reservation.commission?.amountCents),
      commissionCurrency: reservation.commission?.currency,
      estimatedSigningDate: reservation.estimatedSigningDate ?? '',
      notes: reservation.notes ?? '',
    };
  }
  return {
    propertyId: subject.propertyId,
    clientId: subject.client?.id ?? '',
    opportunityId: subject.opportunityId,
    operation: subject.operations[0] ?? 'sale',
    amount: '',
    currency: 'USD',
    commissionPct: '',
    commissionAmount: '',
    commissionCurrency: undefined,
    estimatedSigningDate: '',
    notes: '',
  };
}

/**
 * Reservar una propiedad (desde su ficha o desde una destacada de un contacto) o editar su reserva
 * activa. Al editar, el contacto y la operación no cambian: se ven, pero no se eligen.
 */
export function ReservationDialog({
  subject,
  reservation,
  open,
  onOpenChange,
}: {
  readonly subject: ReservationSubject;
  /** La reserva activa a editar; sin ella, es una reserva nueva. */
  readonly reservation?: ReservationRow | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const editing = reservation !== undefined;
  const [error, setError] = useState<string | undefined>();
  const form = useForm<Values, unknown, Valid>({
    resolver: contractResolver(ReservePropertyInputSchema),
    defaultValues: defaults(subject, reservation),
  });
  const { control } = form;
  const pending = form.formState.isSubmitting;
  const fixedClient = editing ? reservation.client : subject.client;

  function close() {
    form.reset(defaults(subject, reservation));
    setError(undefined);
    onOpenChange(false);
  }

  async function submit(values: Valid) {
    setError(undefined);
    const message = await runAction(() =>
      editing
        ? updateReservationAction({
            reservationId: reservation.id,
            agentUserId: values.agentUserId,
            managerUserId: values.managerUserId,
            amount: values.amount,
            currency: values.currency,
            commissionPct: values.commissionPct,
            commissionAmount: values.commissionAmount,
            commissionCurrency: values.commissionCurrency,
            estimatedSigningDate: values.estimatedSigningDate,
            notes: values.notes,
          })
        : reservePropertyAction(values),
    );
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(editing ? 'Reserva actualizada' : `${subject.code} quedó reservada`);
    close();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar la reserva' : `Reservar ${subject.code}`}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'El contacto y la operación no cambian: si cambian, la reserva se da por caída y se reserva de nuevo.'
              : 'La propiedad pasa a reservada: deja de ofrecerse en la web hasta que la reserva se caiga.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => void form.handleSubmit(submit)(event)}
          >
            <FormAlert message={error} />
            <div className="grid gap-4 sm:grid-cols-2">
              {fixedClient === undefined ? (
                <FormField
                  control={control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Contacto</FormLabel>
                      <FormControl>
                        <EntityPicker
                          value={field.value === '' ? undefined : field.value}
                          initial={undefined}
                          onChange={(id) => {
                            field.onChange(id ?? '');
                          }}
                          loadPage={loadClientOptions}
                          placeholder="Buscalo por nombre, teléfono o email"
                          searchPlaceholder="Buscar contacto"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-sm font-medium">Contacto</span>
                  <span className="text-sm text-muted-foreground">
                    {fixedClient.name ?? 'Contacto sin datos'}
                  </span>
                </div>
              )}
              {editing ? (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Operación</span>
                  <span className="text-sm text-muted-foreground">
                    {OPERATION_LABELS[reservation.operation]}
                  </span>
                </div>
              ) : (
                <SelectField
                  control={control}
                  name="operation"
                  label="Operación"
                  options={subject.operations}
                  labels={OPERATION_LABELS}
                />
              )}
              <TextField
                control={control}
                name="estimatedSigningDate"
                label="Fecha estimada de firma"
                type="date"
              />
              <FormField
                control={control}
                name="agentUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agente</FormLabel>
                    <FormControl>
                      <EntityPicker
                        value={field.value}
                        initial={
                          reservation?.agent === undefined
                            ? undefined
                            : {
                                value: reservation.agent.id,
                                label: reservation.agent.name ?? 'Usuario inactivo',
                              }
                        }
                        onChange={field.onChange}
                        loadPage={loadUserOptions}
                        placeholder={editing ? 'Sin agente' : 'Vos'}
                        searchPlaceholder="Buscar usuario"
                        {...(editing ? {} : { clearLabel: 'Quitar agente' })}
                      />
                    </FormControl>
                    {!editing && <FormDescription>Sin elegir, quedás vos a cargo.</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="managerUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gerente (opcional)</FormLabel>
                    <FormControl>
                      <EntityPicker
                        value={field.value}
                        initial={
                          reservation?.manager === undefined
                            ? undefined
                            : {
                                value: reservation.manager.id,
                                label: reservation.manager.name ?? 'Usuario inactivo',
                              }
                        }
                        onChange={field.onChange}
                        loadPage={loadUserOptions}
                        placeholder="Sin gerente"
                        searchPlaceholder="Buscar usuario"
                        clearLabel="Quitar gerente"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextField
                control={control}
                name="amount"
                label="Valor (opcional)"
                inputMode="decimal"
                description="Sin puntos de miles."
              />
              <SelectField
                control={control}
                name="currency"
                label="Moneda del valor"
                options={CURRENCIES}
                labels={CURRENCY_LABELS}
                empty="—"
              />
              <TextField
                control={control}
                name="commissionPct"
                label="Comisión en % (opcional)"
                inputMode="decimal"
              />
              <div className="hidden sm:block" />
              <TextField
                control={control}
                name="commissionAmount"
                label="Comisión en monto (opcional)"
                inputMode="decimal"
                description="Puede ir junto con el porcentaje."
              />
              <SelectField
                control={control}
                name="commissionCurrency"
                label="Moneda de la comisión"
                options={CURRENCIES}
                labels={CURRENCY_LABELS}
                empty="—"
              />
              <div className="sm:col-span-2">
                <TextareaField control={control} name="notes" label="Notas" rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
                {editing ? 'Guardar' : 'Reservar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
