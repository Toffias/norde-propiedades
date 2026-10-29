'use client';

import type { PropertySheetLayoutValue } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { Label } from '@norde/ui/components/label';
import { cn } from '@norde/ui/lib/utils';
import { FileDownIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useId, useState, useTransition } from 'react';

import { FormAlert } from '../../shared/components/form-alert';
import { loadPdfExportOptionsAction } from '../actions';
import { SHEET_LAYOUT_LABELS } from '../detail-labels';

/** Para qué sirve cada formato, en una línea. */
const LAYOUT_HINTS: Readonly<Record<PropertySheetLayoutValue, string>> = {
  landscape: 'Una hoja apaisada por propiedad, ideal para WhatsApp',
  landscape_map: 'Igual, con el mapa en lugar de una foto',
  portrait: 'La ficha completa, con todas las fotos',
  portrait_map: 'La ficha completa, con la ubicación',
  grid: 'Una tabla para comparar varias propiedades',
};

/** El último formato elegido, para la próxima vez (preferencia de este navegador). */
const LAST_LAYOUT_KEY = 'norde-sheet-pdf-layout';

function rememberedLayout<L extends PropertySheetLayoutValue>(
  layouts: readonly L[],
): L | undefined {
  try {
    const stored = window.localStorage.getItem(LAST_LAYOUT_KEY);
    return layouts.find((layout) => layout === stored);
  } catch {
    // Sin acceso al almacenamiento (modo privado): se usa el primero.
    return undefined;
  }
}

function remember(layout: PropertySheetLayoutValue): void {
  try {
    window.localStorage.setItem(LAST_LAYOUT_KEY, layout);
  } catch {
    // Sin acceso al almacenamiento: la próxima vez se elige de nuevo.
  }
}

/** Un esquema chico de cómo sale la hoja, para reconocer el formato de un vistazo. */
function LayoutSketch({ layout }: { readonly layout: PropertySheetLayoutValue }) {
  const landscape = layout === 'landscape' || layout === 'landscape_map';
  const block = 'rounded-[2px] bg-muted-foreground/25';
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 gap-1 rounded-md border border-border bg-background p-1.5',
        landscape || layout === 'grid' ? 'h-12 w-16 flex-row' : 'h-16 w-12 flex-col',
      )}
    >
      {layout === 'grid' ? (
        <span className="flex w-full flex-col gap-1">
          {[0, 1, 2, 3].map((row) => (
            <span key={row} className="flex h-1.5 gap-1">
              <span className="w-2 rounded-[1px] bg-primary/50" />
              <span className={cn('flex-1', block)} />
            </span>
          ))}
        </span>
      ) : landscape ? (
        <>
          <span className="flex flex-1 flex-col gap-1">
            <span className="h-1.5 w-3/4 rounded-[1px] bg-foreground/50" />
            <span className={cn('flex-1', block)} />
          </span>
          <span className="grid flex-1 grid-cols-2 gap-0.5">
            <span className="rounded-[1px] bg-primary/40" />
            <span
              className={cn(
                'rounded-[1px]',
                layout === 'landscape_map' ? 'bg-foreground/30' : 'bg-primary/40',
              )}
            />
            <span className="rounded-[1px] bg-primary/25" />
            <span className="rounded-[1px] bg-primary/25" />
          </span>
        </>
      ) : (
        <>
          <span className="h-1.5 w-3/4 rounded-[1px] bg-foreground/50" />
          <span className="h-4 rounded-[1px] bg-primary/40" />
          <span className={cn('flex-1', block)} />
          {layout === 'portrait_map' && <span className="h-2 rounded-[1px] bg-foreground/30" />}
        </>
      )}
    </span>
  );
}

/**
 * Elige el formato de la ficha en PDF (los de Tokko, #175) y, si "Ficha y PDF" lo pide, si van
 * los datos del agente. `onSubmit` arma el pedido y devuelve el error a mostrar, si hubo.
 */
export function SheetPdfDialog<L extends PropertySheetLayoutValue>({
  open,
  onOpenChange,
  title,
  description,
  layouts,
  onSubmit,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly layouts: readonly L[];
  readonly onSubmit: (choice: {
    readonly layout: L;
    readonly includeAgent: boolean | undefined;
  }) => Promise<string | undefined>;
}) {
  const id = useId();
  const [layout, setLayout] = useState<L | undefined>();
  const [askAgent, setAskAgent] = useState(false);
  const [includeAgent, setIncludeAgent] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const selected = layout ?? layouts[0];

  useEffect(() => {
    if (!open) return;
    let active = true;
    void loadPdfExportOptionsAction().then((options) => {
      if (!active) return;
      setAskAgent(options.askAgent);
      setLayout((current) => current ?? rememberedLayout(layouts));
    });
    return () => {
      active = false;
    };
  }, [open, layouts]);

  function submit() {
    if (selected === undefined) return;
    setError(undefined);
    startTransition(async () => {
      const message = await onSubmit({
        layout: selected,
        includeAgent: askAgent ? includeAgent : undefined,
      });
      if (message !== undefined) {
        setError(message);
        return;
      }
      remember(selected);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle icon={FileDownIcon}>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <div role="radiogroup" aria-label="Formato" className="grid gap-2 sm:grid-cols-2">
          {layouts.map((option) => {
            const checked = option === selected;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={pending}
                onClick={() => {
                  setLayout(option);
                }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60',
                  checked
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/5',
                )}
              >
                <LayoutSketch layout={option} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{SHEET_LAYOUT_LABELS[option]}</span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {LAYOUT_HINTS[option]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {askAgent && (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-agent`}
              checked={includeAgent}
              disabled={pending}
              onCheckedChange={(value) => {
                setIncludeAgent(value === true);
              }}
            />
            <Label htmlFor={`${id}-agent`}>Incluir mis datos de contacto</Label>
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending || selected === undefined} onClick={submit}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Armar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
