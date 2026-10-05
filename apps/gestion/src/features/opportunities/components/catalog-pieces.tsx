'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@norde/ui/components/button';
import { Form } from '@norde/ui/components/form';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { cn } from '@norde/ui/lib/utils';
import { GripVerticalIcon, Loader2Icon } from 'lucide-react';
import { useId, useState, useTransition, type ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

import { runAction, type ActionResult } from '../../../lib/action-result';
import type { PanelState } from '../../../lib/panel-params';
import { FormAlert } from '../../shared/components/form-alert';

// Piezas de los catálogos de Mi empresa → Oportunidades: lista ordenable y formulario del panel.

/** El color de un estado. Es un dato que carga Norde: va como estilo en línea. */
export function ColorDot({
  color,
  className,
}: {
  readonly color: string;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-border', className)}
      style={{ backgroundColor: color }}
    />
  );
}

/** El color de un estado apenas tenido, para fondos (cabeceras, columnas, tarjetas por estado). */
export function stageTint(color: string, percent: number): string {
  return `color-mix(in oklab, ${color} ${String(percent)}%, transparent)`;
}

function SortableRow({
  id,
  label,
  disabled,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-center gap-3 border-b border-border bg-card px-3 py-2.5 last:border-b-0',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Mover ${label}`}
        disabled={disabled}
        className="cursor-grab touch-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="h-4 w-4" />
      </Button>
      {children}
    </li>
  );
}

/**
 * Lista que se ordena arrastrando (o con el teclado: espacio y flechas). El orden nuevo se ve al
 * instante; si el servidor lo rechaza, vuelve al anterior.
 */
export function SortableCatalog<T extends { readonly id: string }>({
  items,
  label,
  disabled,
  reorder,
  children,
}: {
  readonly items: readonly T[];
  /** Nombre de cada ítem, para el botón de mover. */
  readonly label: (item: T) => string;
  readonly disabled: boolean;
  readonly reorder: (ids: string[]) => Promise<ActionResult>;
  readonly children: (item: T) => ReactNode;
}) {
  // Un ID estable: con dos listas en la página, el contador interno de dnd-kit no coincide entre
  // el servidor y el cliente.
  const dndId = useId();
  const [optimistic, setOptimistic] = useState<readonly T[] | undefined>();
  const [pending, startTransition] = useTransition();
  const order = optimistic ?? items;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) return;
    const from = order.findIndex((item) => item.id === active.id);
    const to = order.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove([...order], from, to);
    setOptimistic(next);
    startTransition(async () => {
      const error = await runAction(() => reorder(next.map((item) => item.id)));
      if (error !== undefined) toast.error(error);
      else toast.success('Orden guardado');
      setOptimistic(undefined);
    });
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="overflow-hidden rounded-md border border-border" aria-busy={pending}>
          {order.map((item) => (
            <SortableRow
              key={item.id}
              id={item.id}
              label={label(item)}
              disabled={disabled || pending}
            >
              {children(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/** Cuerpo y botones del formulario del panel lateral, con su error y el envío. */
export function SheetForm<T extends FieldValues>({
  form,
  submit,
  done,
  onDone,
  readOnly,
  children,
}: {
  readonly form: UseFormReturn<T>;
  readonly submit: (values: T) => Promise<ActionResult>;
  readonly done: string;
  readonly onDone: () => void;
  readonly readOnly: boolean;
  readonly children: ReactNode;
}) {
  const [error, setError] = useState<string | undefined>();
  const pending = form.formState.isSubmitting;

  async function send(values: T) {
    setError(undefined);
    const message = await runAction(() => submit(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(done);
    onDone();
  }

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(send)(event)}
      >
        <SheetBody scroll className="flex flex-col gap-5">
          <FormAlert message={error} />
          {children}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          )}
        </SheetFooter>
      </form>
    </Form>
  );
}

/**
 * Si el panel abierto es de este catálogo: el alta con su pestaña, o la edición de uno de sus
 * ítems (la pantalla tiene dos catálogos y comparten el panel).
 */
export function isCatalogPanel(
  panel: PanelState | undefined,
  tab: string,
  items: readonly { readonly id: string }[],
): boolean {
  if (panel === undefined) return false;
  if (panel.kind === 'new') return panel.tab === tab;
  return items.some((item) => item.id === panel.id);
}
