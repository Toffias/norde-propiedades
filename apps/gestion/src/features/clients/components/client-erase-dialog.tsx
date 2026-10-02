'use client';

import { ERASURE_CONFIRMATION_WORD, type ClientDetail } from '@norde/core/clients/contracts';
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
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, ShieldAlertIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { eraseClientDataAction } from '../actions';
import { clientName } from '../client-format';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Hoy en Buenos Aires, `AAAA-MM-DD`. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

/** Como lo compara el servidor: sin mayúsculas, acentos ni espacios de más. */
function comparable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const ERASED = [
  'La ficha, con sus teléfonos, emails, relaciones y etiquetas.',
  'Las oportunidades, consultas, búsquedas, destacadas, envíos y la actividad.',
  'Las conversaciones del agente de IA y los vínculos como propietario.',
  'Su historial de cambios y los contactos que se le unificaron.',
];

/**
 * Supresión de datos (Ley 25.326), en dos pasos: primero qué se borra y la fecha del pedido;
 * después, escribir el nombre del contacto. No hay papelera: se borra para siempre.
 */
export function ClientEraseDialog({
  detail,
  open,
  onOpenChange,
}: {
  readonly detail: ClientDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'explain' | 'confirm'>('explain');
  const [requestedOn, setRequestedOn] = useState(today);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const name = clientName(detail.name);
  const expected = detail.name ?? ERASURE_CONFIRMATION_WORD;
  const matches = comparable(typed) !== '' && comparable(typed) === comparable(expected);

  const close = (next: boolean) => {
    if (pending) return;
    if (!next) {
      setStep('explain');
      setTyped('');
      setError(undefined);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="h-5 w-5 text-destructive" />
            Suprimir los datos de {name}
          </DialogTitle>
          <DialogDescription>
            {step === 'explain'
              ? 'Es para cuando el cliente pide que borremos sus datos (Ley 25.326). Se borra para siempre, sin papelera.'
              : 'Último paso: esto no se puede deshacer.'}
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />

        {step === 'explain' ? (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <p className="font-medium">Se borra:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {ERASED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <p className="text-muted-foreground">
              Queda una constancia sin datos personales: la fecha del pedido, quién lo suprimió y
              cuándo. Las propiedades de las que era propietario quedan, sin él.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="erasure-requested-on">¿Cuándo lo pidió el cliente?</Label>
              <Input
                id="erasure-requested-on"
                type="date"
                value={requestedOn}
                max={today()}
                onChange={(event) => {
                  setRequestedOn(event.target.value);
                }}
                className="w-full sm:w-48"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            <Label htmlFor="erasure-confirmation">
              Para confirmar, escribí{' '}
              {detail.name === undefined ? 'la palabra' : 'el nombre del contacto'}
            </Label>
            <p className="font-semibold break-words">{expected}</p>
            <Input
              id="erasure-confirmation"
              autoComplete="off"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (step === 'confirm') setStep('explain');
              else close(false);
            }}
          >
            {step === 'confirm' ? 'Volver' : 'Cancelar'}
          </Button>
          {step === 'explain' ? (
            <Button
              type="button"
              variant="destructive"
              disabled={requestedOn === ''}
              onClick={() => {
                setError(undefined);
                setStep('confirm');
              }}
            >
              Continuar
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={!matches || pending}
              onClick={() => {
                setError(undefined);
                startTransition(async () => {
                  const message = await runAction(() =>
                    eraseClientDataAction({
                      clientId: detail.id,
                      confirmation: typed,
                      requestedOn,
                    }),
                  );
                  if (message !== undefined) {
                    setError(message);
                    return;
                  }
                  toast.success('Se suprimieron los datos del contacto');
                  onOpenChange(false);
                  router.replace('/contactos');
                });
              }}
            >
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Suprimir para siempre
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
