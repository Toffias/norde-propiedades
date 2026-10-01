'use client';

import {
  GRID_COLUMN_VALUES,
  MAX_GRID_COLUMN_COUNT,
  type GridColumnValue,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import { Label } from '@norde/ui/components/label';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { updateGridColumnsAction } from '../catalog-actions';
import { GRID_COLUMN_LABELS } from '../labels';

/**
 * Columnas que la grilla del buscador suma a las fijas (código, propiedad, operación y precio,
 * estado). Valen para toda la inmobiliaria.
 */
export function GridColumnsForm({
  columns,
  disabled,
}: {
  readonly columns: readonly GridColumnValue[];
  readonly disabled: boolean;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<readonly GridColumnValue[]>(columns);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const full = chosen.length >= MAX_GRID_COLUMN_COUNT;

  function toggle(column: GridColumnValue, on: boolean) {
    setChosen((current) =>
      on ? [...current, column] : current.filter((candidate) => candidate !== column),
    );
  }

  function save() {
    setError(undefined);
    startTransition(async () => {
      const message = await runAction(() => updateGridColumnsAction({ columns: [...chosen] }));
      if (message === undefined) toast.success('Columnas guardadas');
      else setError(message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Elegí hasta {MAX_GRID_COLUMN_COUNT}. Se muestran en el orden en que las marcás, en pantallas
        anchas.
      </p>
      <FormAlert message={error} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GRID_COLUMN_VALUES.map((column) => {
          const checked = chosen.includes(column);
          const position = chosen.indexOf(column) + 1;
          return (
            <div key={column} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${column}`}
                checked={checked}
                disabled={disabled || (!checked && full)}
                onCheckedChange={(next) => {
                  toggle(column, next === true);
                }}
              />
              <Label htmlFor={`${id}-${column}`} className="font-normal">
                {GRID_COLUMN_LABELS[column]}
                {checked && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {' '}
                    ({position}.ª)
                  </span>
                )}
              </Label>
            </div>
          );
        })}
      </div>
      {!disabled && (
        <Button type="button" className="self-start" disabled={pending} onClick={save}>
          {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
          Guardar columnas
        </Button>
      )}
    </div>
  );
}
