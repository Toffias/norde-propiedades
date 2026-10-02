'use client';

import { MAX_CLIENT_NOTE_LENGTH } from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Card } from '@norde/ui/components/card';
import { Label } from '@norde/ui/components/label';
import { toast } from '@norde/ui/components/sonner';
import { Textarea } from '@norde/ui/components/textarea';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { addClientNoteAction } from '../activity-actions';

/** Id del campo: "Agregar nota" en la tarjeta lleva hasta acá. */
export const NOTE_FIELD_ID = 'nueva-nota';

/** Agregar una nota a la actividad del contacto ("Llamé, vuelve a llamar el lunes"). */
export function ClientNoteComposer({ clientId }: { readonly clientId: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const empty = text.trim() === '';

  // "Agregar nota" en la tarjeta trae hasta acá (`#nueva-nota`): el foco queda en el campo.
  useEffect(() => {
    if (window.location.hash === `#${NOTE_FIELD_ID}`) field.current?.focus();
  }, []);

  return (
    <Card className="gap-3 p-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (empty) return;
          setError(undefined);
          startTransition(async () => {
            const message = await runAction(() => addClientNoteAction({ clientId, text }));
            if (message !== undefined) {
              setError(message);
              return;
            }
            setText('');
            toast.success('Nota agregada');
          });
        }}
      >
        <Label htmlFor={NOTE_FIELD_ID}>Agregar una nota</Label>
        <FormAlert message={error} />
        <Textarea
          ref={field}
          id={NOTE_FIELD_ID}
          value={text}
          maxLength={MAX_CLIENT_NOTE_LENGTH}
          rows={3}
          placeholder="Qué hablaste con el contacto, qué quedó pendiente…"
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            {text.length.toLocaleString('es-AR')} / {MAX_CLIENT_NOTE_LENGTH.toLocaleString('es-AR')}
          </p>
          <Button type="submit" size="sm" disabled={pending || empty}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Guardar nota
          </Button>
        </div>
      </form>
    </Card>
  );
}
