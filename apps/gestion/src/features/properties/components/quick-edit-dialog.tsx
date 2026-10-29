'use client';

import {
  CURRENCIES,
  MANUAL_STATUS_VALUES,
  OPERATIONS,
  type BulkEditChange,
  type BulkEditResult,
  type Currency,
  type Operation,
  type PropertySelection,
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
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { PagedMultiSelect, type ComboboxOption } from '@norde/ui/components/paged-combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, PencilIcon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { FormAlert } from '../../shared/components/form-alert';
import { bulkEditPropertiesAction, loadTagOptions } from '../actions';
import {
  BULK_SKIP_LABELS,
  CURRENCY_LABELS,
  OPERATION_LABELS,
  PROPERTY_STATUS_DISPLAY,
} from '../labels';
import type { BulkPermissions } from './property-bulk-actions';

type Field = BulkEditChange['field'];

const FIELD_LABELS: Readonly<Record<Field, string>> = {
  status: 'Estado',
  price: 'Precio',
  producer: 'Captador',
  tags: 'Etiquetas',
  publication: 'Publicación en la web',
};

type PublicationOption = 'publishedOnWeb' | 'showPriceOnWeb' | 'showExactAddress' | 'featured';
type PublicationChoice = 'keep' | 'on' | 'off';

/** Las mismas opciones que el botón "Publicación" de la ficha, con qué hacer en cada una. */
const PUBLICATION_OPTIONS: readonly {
  readonly option: PublicationOption;
  readonly label: string;
  readonly on: string;
  readonly off: string;
}[] = [
  { option: 'publishedOnWeb', label: 'Publicar en web', on: 'Publicar', off: 'Despublicar' },
  { option: 'showPriceOnWeb', label: 'Mostrar el precio', on: 'Mostrar', off: 'Ocultar' },
  {
    option: 'showExactAddress',
    label: 'Mostrar la dirección exacta',
    on: 'Mostrar',
    off: 'Ocultar',
  },
  { option: 'featured', label: 'Destacada', on: 'Destacar', off: 'Quitar destacada' },
];

const PUBLICATION_CHOICES: readonly PublicationChoice[] = ['keep', 'on', 'off'];

const INITIAL_PUBLICATION: Readonly<Record<PublicationOption, PublicationChoice>> = {
  publishedOnWeb: 'on',
  showPriceOnWeb: 'keep',
  showExactAddress: 'keep',
  featured: 'keep',
};

function summary(result: BulkEditResult): string {
  const parts = [
    result.updated === 1 ? '1 propiedad cambiada' : `${result.updated} propiedades cambiadas`,
    result.unchanged > 0 ? `${result.unchanged} ya estaban así` : undefined,
    result.skippedCount > 0 ? `${result.skippedCount} sin cambiar` : undefined,
  ];
  return parts.filter((part) => part !== undefined).join(' · ');
}

/**
 * Edición rápida masiva: un campo (estado, precio, captador, etiquetas o publicación en la web)
 * para todas las propiedades seleccionadas. Las que no se pueden cambiar se informan con el motivo.
 * Si el cambio sale bien, al cerrar se desmarca la selección; si falla, queda para reintentar.
 */
export function QuickEditDialog({
  open,
  onOpenChange,
  selection,
  count,
  permissions,
  onApplied,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly selection: PropertySelection;
  readonly count: number;
  readonly permissions: BulkPermissions;
  readonly onApplied: () => void;
}) {
  const id = useId();
  const [field, setField] = useState<Field>('status');
  const [status, setStatus] = useState<(typeof MANUAL_STATUS_VALUES)[number]>('paused');
  const [operation, setOperation] = useState<Operation>('sale');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [price, setPrice] = useState('');
  const [producer, setProducer] = useState<string | undefined>();
  const [addTags, setAddTags] = useState<readonly ComboboxOption[]>([]);
  const [removeTags, setRemoveTags] = useState<readonly ComboboxOption[]>([]);
  const [publication, setPublication] = useState(INITIAL_PUBLICATION);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<BulkEditResult | undefined>();
  const [pending, startTransition] = useTransition();

  const fields: readonly Field[] = [
    'status',
    'price',
    ...(permissions.changeProducer ? (['producer'] as const) : []),
    'tags',
    ...(permissions.publish ? (['publication'] as const) : []),
  ];
  const statuses = MANUAL_STATUS_VALUES.filter(
    (value) => permissions.markAvailable || value !== 'available',
  );

  function close(next: boolean) {
    if (!next) {
      setError(undefined);
      setResult(undefined);
    }
    onOpenChange(next);
    // Con el resultado a la vista, el cambio ya se aplicó: se desmarca al cerrarlo.
    if (!next && result !== undefined) onApplied();
  }

  function change(): BulkEditChange | undefined {
    switch (field) {
      case 'status':
        return { field, status };
      case 'price':
        return {
          field,
          operation,
          currency,
          ...(price.trim() === '' ? {} : { price: price.trim() }),
        };
      case 'producer':
        return producer === undefined ? undefined : { field, userId: producer };
      case 'tags':
        return {
          field,
          add: addTags.map((tag) => tag.value),
          remove: removeTags.map((tag) => tag.value),
        };
      case 'publication': {
        const chosen = PUBLICATION_OPTIONS.filter(({ option }) => publication[option] !== 'keep');
        if (chosen.length === 0) return undefined;
        return {
          field,
          ...Object.fromEntries(chosen.map(({ option }) => [option, publication[option] === 'on'])),
        };
      }
    }
  }

  function apply() {
    const next = change();
    if (next === undefined) {
      setError(
        field === 'publication'
          ? 'Elegí qué cambiar de la publicación.'
          : 'Elegí el nuevo captador.',
      );
      return;
    }
    setError(undefined);
    startTransition(async () => {
      try {
        const response = await bulkEditPropertiesAction({ selection, change: next });
        if (!response.ok) {
          setError(response.message);
          return;
        }
        if (response.value.updated === 0) toast.warning(summary(response.value));
        else toast.success(summary(response.value));
        if (response.value.skippedCount === 0) {
          close(false);
          onApplied();
        } else setResult(response.value);
      } catch {
        setError(UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle icon={PencilIcon}>Edición rápida</DialogTitle>
          <DialogDescription>
            {count === 1 ? 'Se cambia 1 propiedad.' : `Se cambian ${count} propiedades.`} Cada
            cambio queda en el historial de su propiedad.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />

        {result === undefined ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-field`}>Qué cambiar</Label>
              <Select
                value={field}
                onValueChange={(value) => {
                  setField(fields.find((candidate) => candidate === value) ?? 'status');
                }}
              >
                <SelectTrigger id={`${id}-field`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((value) => (
                    <SelectItem key={value} value={value}>
                      {FIELD_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {field === 'status' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-status`}>Nuevo estado</Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(statuses.find((candidate) => candidate === value) ?? 'paused');
                  }}
                >
                  <SelectTrigger id={`${id}-status`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        {PROPERTY_STATUS_DISPLAY[value].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Reservada no se elige acá: la marca una reserva.
                </p>
              </div>
            )}

            {field === 'price' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-operation`}>Operación</Label>
                  <Select
                    value={operation}
                    onValueChange={(value) => {
                      setOperation(OPERATIONS.find((candidate) => candidate === value) ?? 'sale');
                    }}
                  >
                    <SelectTrigger id={`${id}-operation`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {OPERATION_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-currency`}>Moneda</Label>
                  <Select
                    value={currency}
                    onValueChange={(value) => {
                      setCurrency(CURRENCIES.find((candidate) => candidate === value) ?? 'USD');
                    }}
                  >
                    <SelectTrigger id={`${id}-currency`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {CURRENCY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`${id}-price`}>Nuevo precio</Label>
                  <Input
                    id={`${id}-price`}
                    inputMode="decimal"
                    placeholder="Vacío: precio a consultar"
                    value={price}
                    onChange={(event) => {
                      setPrice(event.target.value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sin puntos de miles. Solo cambia las propiedades que ya tienen esa operación.
                  </p>
                </div>
              </div>
            )}

            {field === 'producer' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-producer`}>Nuevo captador</Label>
                <EntityPicker
                  id={`${id}-producer`}
                  value={producer}
                  initial={undefined}
                  onChange={setProducer}
                  loadPage={loadUserOptions}
                  placeholder="Elegí un usuario"
                  searchPlaceholder="Buscar por nombre o email"
                />
                <p className="text-xs text-muted-foreground">
                  La propiedad pasa a la sucursal del nuevo captador.
                </p>
              </div>
            )}

            {field === 'tags' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Agregar etiquetas</Label>
                  <PagedMultiSelect
                    value={addTags}
                    onChange={setAddTags}
                    loadPage={loadTagOptions}
                    placeholder="Ninguna"
                    searchPlaceholder="Buscar etiqueta"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Quitar etiquetas</Label>
                  <PagedMultiSelect
                    value={removeTags}
                    onChange={setRemoveTags}
                    loadPage={loadTagOptions}
                    placeholder="Ninguna"
                    searchPlaceholder="Buscar etiqueta"
                  />
                </div>
              </div>
            )}
            {field === 'publication' && (
              <div className="flex flex-col gap-3">
                {PUBLICATION_OPTIONS.map(({ option, label, on, off }) => (
                  <div
                    key={option}
                    className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <Label htmlFor={`${id}-${option}`}>{label}</Label>
                    <Select
                      value={publication[option]}
                      onValueChange={(value) => {
                        const choice =
                          PUBLICATION_CHOICES.find((candidate) => candidate === value) ?? 'keep';
                        setPublication((current) => ({ ...current, [option]: choice }));
                      }}
                    >
                      <SelectTrigger id={`${id}-${option}`} className="w-full sm:w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keep">No cambiar</SelectItem>
                        <SelectItem value="on">{on}</SelectItem>
                        <SelectItem value="off">{off}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  La web la muestra solo mientras esté disponible.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p>{summary(result)}.</p>
            <p className="text-muted-foreground">No se cambiaron:</p>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {result.skipped.map((item) => (
                <li key={item.code}>
                  <span className="font-medium tabular-nums">{item.code}</span>:{' '}
                  {BULK_SKIP_LABELS[item.reason]}
                </li>
              ))}
            </ul>
            {result.skippedCount > result.skipped.length && (
              <p className="text-muted-foreground">
                Y {result.skippedCount - result.skipped.length} más.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {result === undefined ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  close(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="button" disabled={pending} onClick={apply}>
                {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
                Aplicar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={() => {
                close(false);
              }}
            >
              Listo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
