'use client';

import { Button } from '@norde/ui/components/button';
import { SectionCard } from '@norde/ui/components/section-card';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, PencilIcon } from 'lucide-react';
import { useState, useTransition, type ReactNode } from 'react';

import type { ActionResult } from '../../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../../lib/errors';
import { FormAlert } from '../../../shared/components/form-alert';

/**
 * Una sección de la ficha que se edita en el lugar: muestra los datos y, con "Editar", el formulario
 * de su caso de uso. Guardar llama una Server Action; si sale bien, vuelve a la vista.
 */
export function InlineSection({
  title,
  canEdit,
  view,
  form,
  className,
}: {
  readonly title: string;
  readonly canEdit: boolean;
  readonly view: ReactNode;
  /** El formulario: recibe cómo guardar y cómo cancelar. */
  readonly form: (controls: InlineFormControls) => ReactNode;
  readonly className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const controls: InlineFormControls = {
    pending,
    cancel: () => {
      setError(undefined);
      setEditing(false);
    },
    save: (action, success = 'Cambios guardados.') => {
      setError(undefined);
      startTransition(async () => {
        try {
          const result = await action();
          if (!result.ok) {
            setError(result.message);
            return;
          }
          toast.success(success);
          setEditing(false);
        } catch {
          setError(UNEXPECTED_ERROR_MESSAGE);
        }
      });
    },
  };

  return (
    <SectionCard
      title={title}
      {...(className === undefined ? {} : { className })}
      {...(canEdit && !editing
        ? {
            action: (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(true);
                }}
              >
                <PencilIcon className="h-4 w-4" />
                Editar
              </Button>
            ),
          }
        : {})}
    >
      {editing ? (
        <div className="flex flex-col gap-4">
          <FormAlert message={error} />
          {form(controls)}
        </div>
      ) : (
        view
      )}
    </SectionCard>
  );
}

export interface InlineFormControls {
  readonly pending: boolean;
  readonly cancel: () => void;
  readonly save: (action: () => Promise<ActionResult>, success?: string) => void;
}

/** Botones de guardar y cancelar de un formulario en línea. */
export function InlineFormActions({ controls }: { readonly controls: InlineFormControls }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={controls.cancel} disabled={controls.pending}>
        Cancelar
      </Button>
      <Button type="submit" disabled={controls.pending}>
        {controls.pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
        Guardar
      </Button>
    </div>
  );
}

/** Pares etiqueta / valor de la vista de una sección. */
export function Facts({
  items,
  columns = 2,
}: {
  readonly items: readonly { readonly label: string; readonly value: ReactNode }[];
  readonly columns?: 2 | 3;
}) {
  return (
    <dl
      className={
        columns === 3
          ? 'grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3'
          : 'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2'
      }
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-sm font-medium break-words tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
