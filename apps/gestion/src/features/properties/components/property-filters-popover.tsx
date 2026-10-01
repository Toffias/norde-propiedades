'use client';

import {
  CURRENCIES,
  ListPanelPropertiesQuerySchema,
  PROPERTY_SCOPE_VALUES,
  type Currency,
  type PropertyScopeValue,
  type PropertyViewValue,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { SlidersHorizontalIcon } from 'lucide-react';
import { useId, useState } from 'react';

import { useListNavigation } from '../../shared/components/server-data-table';
import { CURRENCY_LABELS, SCOPE_LABELS } from '../labels';

/** Los filtros del popover tal como están en la URL. */
export interface AdvancedFilterValues {
  readonly currency: string;
  readonly minPrice: string;
  readonly maxPrice: string;
  readonly scope: string;
  readonly view: PropertyViewValue;
}

interface Draft {
  readonly currency: Currency | '';
  readonly minPrice: string;
  readonly maxPrice: string;
  readonly scope: PropertyScopeValue;
  readonly view: PropertyViewValue;
}

const EMPTY_DRAFT: Draft = {
  currency: '',
  minPrice: '',
  maxPrice: '',
  scope: 'all',
  view: 'active',
};

/** Sin moneda: `any` en el select, sin el param en la URL. */
const ANY_CURRENCY = 'any';

function toDraft(filters: AdvancedFilterValues): Draft {
  return {
    currency: CURRENCIES.find((value) => value === filters.currency) ?? '',
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    scope: PROPERTY_SCOPE_VALUES.find((value) => value === filters.scope) ?? 'all',
    view: filters.view,
  };
}

/** Cuántos filtros del popover están aplicados: el número del badge. */
function activeCount(filters: AdvancedFilterValues): number {
  return [
    filters.currency !== '',
    filters.minPrice !== '' || filters.maxPrice !== '',
    filters.scope !== '' && filters.scope !== 'all',
    filters.view === 'trash',
  ].filter(Boolean).length;
}

/** Errores del rango de precio, validados con el mismo contract que la página. */
function priceErrors(draft: Draft): { readonly minPrice?: string; readonly maxPrice?: string } {
  const parsed = ListPanelPropertiesQuerySchema.safeParse({
    currency: draft.currency === '' ? undefined : draft.currency,
    minPrice: draft.minPrice.trim() === '' ? undefined : draft.minPrice.trim(),
    maxPrice: draft.maxPrice.trim() === '' ? undefined : draft.maxPrice.trim(),
  });
  if (parsed.success) return {};
  const errors: { minPrice?: string; maxPrice?: string } = {};
  for (const issue of parsed.error.issues) {
    const [key] = issue.path;
    if ((key === 'minPrice' || key === 'maxPrice') && errors[key] === undefined) {
      // El monto acepta texto o centavos ya parseados: Zod informa la unión con un mensaje genérico.
      errors[key] =
        issue.code === 'invalid_union'
          ? 'Escribí el monto sin puntos de miles, con hasta dos decimales.'
          : issue.message;
    }
  }
  return errors;
}

/**
 * Más filtros del buscador (moneda y precio, alcance y papelera) en un popover: se arman y se
 * aplican juntos con "Aplicar". El badge cuenta los que están aplicados.
 */
export function PropertyFiltersPopover({
  filters,
  sortsByPrice,
  canSeeTrash,
}: {
  readonly filters: AdvancedFilterValues;
  /** Sin moneda no se ordena por precio: al quitarla, el orden vuelve al de siempre. */
  readonly sortsByPrice: boolean;
  readonly canSeeTrash: boolean;
}) {
  const { setParams } = useListNavigation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(filters));
  const id = useId();
  const count = activeCount(filters);
  const errors = priceErrors(draft);
  const invalid = errors.minPrice !== undefined || errors.maxPrice !== undefined;
  const hasCurrency = draft.currency !== '';

  function change(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function apply() {
    if (invalid) return;
    const withPrice = draft.currency !== '';
    setParams({
      currency: withPrice ? draft.currency : undefined,
      minPrice: withPrice ? draft.minPrice.trim() : undefined,
      maxPrice: withPrice ? draft.maxPrice.trim() : undefined,
      scope: draft.scope === 'all' ? undefined : draft.scope,
      view: draft.view === 'active' ? undefined : draft.view,
      ...(sortsByPrice && !withPrice ? { sort: undefined } : {}),
    });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Al abrir, el borrador arranca de lo que está aplicado.
        if (next) setDraft(toDraft(filters));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative justify-self-start bg-card"
          aria-label={count === 0 ? 'Más filtros' : `Más filtros (${count} aplicados)`}
        >
          <SlidersHorizontalIcon className="h-4 w-4" />
          {count > 0 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
            >
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="w-[min(320px,calc(100vw-2rem))] p-0"
      >
        <form
          className="flex flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm font-semibold">Más filtros</p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-currency`}>Moneda</Label>
              <Select
                value={draft.currency === '' ? ANY_CURRENCY : draft.currency}
                onValueChange={(next) => {
                  const currency = CURRENCIES.find((value) => value === next) ?? '';
                  change(currency === '' ? { currency, minPrice: '', maxPrice: '' } : { currency });
                }}
              >
                <SelectTrigger id={`${id}-currency`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_CURRENCY}>Cualquier moneda</SelectItem>
                  {CURRENCIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CURRENCY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['minPrice', 'maxPrice'] as const).map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-${key}`}>{key === 'minPrice' ? 'Desde' : 'Hasta'}</Label>
                  <Input
                    id={`${id}-${key}`}
                    inputMode="decimal"
                    disabled={!hasCurrency}
                    placeholder={hasCurrency ? 'Monto' : 'Elegí moneda'}
                    value={draft[key]}
                    aria-invalid={errors[key] !== undefined}
                    onChange={(event) => {
                      change({ [key]: event.target.value });
                    }}
                  />
                </div>
              ))}
              {invalid && (
                <p className="col-span-2 text-xs text-destructive">
                  {errors.minPrice ?? errors.maxPrice}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-scope`}>Qué propiedades</Label>
              <Select
                value={draft.scope}
                onValueChange={(next) => {
                  change({
                    scope: PROPERTY_SCOPE_VALUES.find((value) => value === next) ?? 'all',
                  });
                }}
              >
                <SelectTrigger id={`${id}-scope`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_SCOPE_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SCOPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canSeeTrash && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-view`}>Qué ver</Label>
                <Select
                  value={draft.view}
                  onValueChange={(next) => {
                    change({ view: next === 'trash' ? 'trash' : 'active' });
                  }}
                >
                  <SelectTrigger id={`${id}-view`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Cartera</SelectItem>
                    <SelectItem value="trash">Papelera</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
              }}
            >
              Limpiar
            </Button>
            <Button type="submit" size="sm" disabled={invalid}>
              Aplicar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
