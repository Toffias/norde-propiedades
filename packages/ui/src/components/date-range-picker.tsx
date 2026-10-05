'use client';

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { DayPicker, type ChevronProps, type DateRange } from 'react-day-picker';
import { es } from 'react-day-picker/locale';

import {
  dateRangePresets,
  EMPTY_DATE_RANGE,
  formatDateRange,
  parseIsoDate,
  toIsoDate,
  type IsoDateRange,
} from '../lib/date-range';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const WIDE_QUERY = '(min-width: 640px)';

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

/** Dos meses en pantallas anchas, uno en mobile. En el server y al hidratar, uno. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === 'left' ? ChevronLeftIcon : ChevronRightIcon;
  return <Icon className={cn('h-4 w-4', className)} aria-hidden />;
}

const DAY_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50';

const CALENDAR_CLASSES = {
  root: 'relative',
  months: 'flex flex-col gap-4 sm:flex-row',
  month: 'flex flex-col gap-2',
  month_caption: 'flex h-8 items-center justify-center',
  caption_label: 'text-sm font-semibold first-letter:uppercase',
  nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
  button_previous:
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40',
  button_next:
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40',
  month_grid: 'border-collapse',
  weekdays: 'flex',
  weekday: 'w-8 pb-1 text-[11px] font-medium text-muted-foreground uppercase',
  week: 'mt-0.5 flex',
  day: 'p-0 text-center',
  day_button: DAY_BUTTON,
  today: '[&>button]:font-bold [&>button]:text-primary',
  outside: 'text-muted-foreground/50',
  disabled: 'opacity-40',
  selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
  range_start: 'rounded-l-md bg-primary/15',
  range_end: 'rounded-r-md bg-primary/15',
  range_middle:
    'bg-primary/15 [&>button]:!bg-transparent [&>button]:!text-foreground [&>button]:rounded-none',
} as const;

export interface DateRangePickerProps {
  /** `AAAA-MM-DD` en cada punta; `''` es sin límite. */
  readonly value: IsoDateRange;
  readonly onChange: (range: IsoDateRange) => void;
  /** Texto del botón sin fechas. */
  readonly placeholder?: string;
  /** Nombre accesible del botón (ej. "Recibida"): se le suma el rango elegido. */
  readonly label: string;
  readonly id?: string;
  readonly className?: string;
  readonly align?: 'start' | 'center' | 'end';
}

/**
 * Un rango de fechas en un solo control: el botón muestra el rango y abre un calendario con atajos.
 * El primer clic marca el inicio y el segundo el fin; con el fin elegido se aplica y se cierra.
 */
export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Cualquier fecha',
  label,
  id,
  className,
  align = 'start',
}: DateRangePickerProps) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  // El inicio elegido mientras se espera el fin.
  const [anchor, setAnchor] = useState<Date | undefined>();
  const text = formatDateRange(value);
  const hasValue = value.from !== '' || value.to !== '';

  function openChange(next: boolean) {
    setOpen(next);
    if (next) {
      const from = parseIsoDate(value.from);
      const to = parseIsoDate(value.to);
      setDraft(from || to ? { from: from ?? to, to: to ?? from } : undefined);
      setAnchor(undefined);
    }
  }

  function apply(range: IsoDateRange) {
    onChange(range);
    setOpen(false);
  }

  function pick(day: Date) {
    if (anchor === undefined) {
      setAnchor(day);
      setDraft({ from: day, to: undefined });
      return;
    }
    const [from, to] = anchor <= day ? [anchor, day] : [day, anchor];
    apply({ from: toIsoDate(from), to: toIsoDate(to) });
  }

  const today = new Date();
  const months = wide ? 2 : 1;
  const shown = draft?.from ?? today;
  // Con dos meses y sin rango, el actual va a la derecha (los filtros miran hacia atrás).
  const defaultMonth =
    draft?.from === undefined && months === 2
      ? new Date(shown.getFullYear(), shown.getMonth() - 1, 1)
      : shown;

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={text === undefined ? label : `${label}: ${text}`}
          className={cn(
            'justify-start gap-2 px-3 font-normal',
            !hasValue && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{text ?? placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="flex w-auto max-w-[95vw] flex-col p-0 sm:flex-row">
        <ul
          aria-label="Atajos"
          className="flex gap-1 overflow-x-auto border-b border-border p-2 sm:w-36 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0"
        >
          {dateRangePresets(today).map((preset) => {
            const active = preset.range.from === value.from && preset.range.to === value.to;
            return (
              <li key={preset.label}>
                <button
                  type="button"
                  className={cn(
                    'w-full rounded-md px-2.5 py-1.5 text-left text-xs whitespace-nowrap transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    active && 'bg-accent font-semibold',
                  )}
                  onClick={() => {
                    apply(preset.range);
                  }}
                >
                  {preset.label}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-3 p-3">
          <DayPicker
            mode="range"
            locale={es}
            numberOfMonths={months}
            defaultMonth={defaultMonth}
            selected={draft}
            onSelect={(_range, day) => {
              pick(day);
            }}
            showOutsideDays={months === 1}
            classNames={CALENDAR_CLASSES}
            components={{ Chevron: CalendarChevron }}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {anchor === undefined ? 'Elegí la fecha de inicio' : 'Elegí la fecha de fin'}
            </span>
            {hasValue && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  apply(EMPTY_DATE_RANGE);
                }}
              >
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
