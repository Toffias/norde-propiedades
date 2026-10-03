'use client';

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
import { Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { EntityPicker } from '../../identity/components/entity-picker';
import { FormAlert } from '../../shared/components/form-alert';
import { loadClientOptions } from '../actions';
import { featurePropertiesAction } from '../activity-actions';

/**
 * Destacar una o varias propiedades a un contacto, desde el buscador o la ficha de la propiedad. Con
 * `clientId`, el contacto ya viene elegido (los interesados de una propiedad).
 */
export function FeatureToClientDialog({
  propertyIds,
  subject,
  client,
  open,
  onOpenChange,
}: {
  readonly propertyIds: readonly string[];
  /** Qué se destaca, para el texto: "NOR-001" o "3 propiedades". */
  readonly subject: string;
  /** El contacto ya elegido, con su nombre. */
  readonly client?: { readonly id: string; readonly name: string } | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const router = useRouter();
  const [clientId, setClientId] = useState<string | undefined>(client?.id);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function close() {
    setClientId(client?.id);
    setError(undefined);
    onOpenChange(false);
  }

  function feature() {
    if (clientId === undefined) {
      setError('Elegí el contacto.');
      return;
    }
    const chosen = clientId;
    startTransition(async () => {
      setError(undefined);
      let featured = 0;
      const message = await runAction(async () => {
        const result = await featurePropertiesAction({
          clientId: chosen,
          propertyIds: [...propertyIds],
        });
        featured = result.featured ?? 0;
        return result;
      });
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(featured === 0 ? 'Ya las tenía destacadas' : 'Destacadas para el contacto', {
        action: {
          label: 'Ver contacto',
          onClick: () => {
            router.push(`/contactos/${chosen}?tab=destacadas` as Route);
          },
        },
      });
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
          <DialogTitle>Destacar a un contacto</DialogTitle>
          <DialogDescription>
            {client === undefined
              ? `Elegí a quién le ofrecés ${subject}. Aparece en sus destacadas, con la coincidencia con sus búsquedas.`
              : `${subject} aparece en las destacadas de ${client.name}, con la coincidencia con sus búsquedas.`}
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        {client === undefined && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-client`}>Contacto</Label>
            <EntityPicker
              id={`${id}-client`}
              value={clientId}
              initial={undefined}
              onChange={setClientId}
              loadPage={loadClientOptions}
              placeholder="Buscalo por nombre, teléfono o email"
              searchPlaceholder="Buscar contacto"
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button type="button" disabled={pending || clientId === undefined} onClick={feature}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Destacar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
