'use client';

import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import { DateRangePicker } from '@norde/ui/components/date-range-picker';
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
import { Switch } from '@norde/ui/components/switch';
import { cn } from '@norde/ui/lib/utils';
import { Loader2Icon, ScrollTextIcon } from 'lucide-react';
import { useEffect, useId, useState, useTransition } from 'react';

import { runAction } from '../../../../lib/action-result';
import { formatDateOnly } from '../../../../lib/format';
import { FormAlert } from '../../../shared/components/form-alert';
import { loadPdfExportOptionsAction } from '../../actions';
import { requestPropertyDocumentAction } from '../../detail-actions';

const DAY_MS = 24 * 60 * 60 * 1000;
/** El reporte cubre como mucho un año (`MAX_OWNER_REPORT_DAYS`): "desde el alta" se acota a eso. */
const MAX_DAYS_BACK = 365;

type Preset = 'last15' | 'last30' | 'sinceListed' | 'custom';

const PRESETS: readonly { readonly value: Preset; readonly label: string }[] = [
  { value: 'last15', label: 'Últimos 15 días' },
  { value: 'last30', label: 'Últimos 30 días' },
  { value: 'sinceListed', label: 'Desde el alta' },
  { value: 'custom', label: 'Otro período' },
];

/** `AAAA-MM-DD` en Buenos Aires. */
function isoDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    date,
  );
}

/**
 * El período de un atajo, hasta hoy. "Desde el alta" no va más atrás de un año: `capped` avisa
 * que se acotó.
 */
function presetPeriod(
  preset: Exclude<Preset, 'custom'>,
  listedAt: Date,
): { readonly from: string; readonly to: string; readonly capped: boolean } {
  const today = new Date();
  const sinceListed = Math.max(0, Math.floor((today.getTime() - listedAt.getTime()) / DAY_MS));
  const daysBack =
    preset === 'last15' ? 14 : preset === 'last30' ? 29 : Math.min(MAX_DAYS_BACK, sinceListed);
  return {
    from: isoDay(new Date(today.getTime() - daysBack * DAY_MS)),
    to: isoDay(today),
    capped: preset === 'sinceListed' && sinceListed > MAX_DAYS_BACK,
  };
}

function SwitchField({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs leading-snug text-muted-foreground">{hint}</span>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * Pide el reporte al propietario (#175): el período (con atajos de 15 y 30 días y desde el alta,
 * como Tokko, o uno a elección), si lleva las publicaciones activas y las estadísticas de los
 * portales y, si Mi empresa pide preguntar, los datos de contacto de quien lo arma.
 */
export function OwnerReportDialog({
  propertyId,
  listedAt,
  open,
  onOpenChange,
  onRequested,
}: {
  readonly propertyId: string;
  /** El alta de la propiedad, para el atajo "desde el alta". */
  readonly listedAt: Date;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRequested: () => void;
}) {
  const id = useId();
  const [preset, setPreset] = useState<Preset>('last30');
  const [period, setPeriod] = useState<{ readonly from: string; readonly to: string }>(() =>
    presetPeriod('last30', listedAt),
  );
  const [capped, setCapped] = useState(false);
  const [publications, setPublications] = useState(true);
  const [statistics, setStatistics] = useState(true);
  const [askAgent, setAskAgent] = useState(false);
  const [includeAgent, setIncludeAgent] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let active = true;
    void loadPdfExportOptionsAction().then((options) => {
      if (active) setAskAgent(options.askAgent);
    });
    return () => {
      active = false;
    };
  }, [open]);

  function choose(next: Preset) {
    setPreset(next);
    if (next === 'custom') return;
    const chosen = presetPeriod(next, listedAt);
    setPeriod({ from: chosen.from, to: chosen.to });
    setCapped(chosen.capped);
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const failure = await runAction(() =>
        requestPropertyDocumentAction({
          propertyId,
          kind: 'owner_report',
          from: period.from,
          to: period.to,
          options: { publications, statistics },
          ...(askAgent ? { includeAgent } : {}),
        }),
      );
      if (failure !== undefined) {
        setError(failure);
        return;
      }
      toast.success('Estamos armando el reporte al propietario.');
      onOpenChange(false);
      onRequested();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle icon={ScrollTextIcon}>Reporte al propietario</DialogTitle>
          <DialogDescription>
            El movimiento de la propiedad comparado con los últimos 15 y 30 días y desde el alta,
            las visitas en cada portal y dónde está publicada. Se arma en PDF y lo podés descargar o
            mandar por email.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Período</h3>
          <div role="radiogroup" aria-label="Período" className="grid grid-cols-2 gap-2">
            {PRESETS.map((option) => {
              const checked = option.value === preset;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={pending}
                  onClick={() => {
                    choose(option.value);
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60',
                    checked
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/5',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {preset === 'custom' ? (
            <DateRangePicker
              id={`${id}-period`}
              label="Período del reporte"
              value={period}
              onChange={setPeriod}
              className="w-full"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Del {formatDateOnly(period.from)} al {formatDateOnly(period.to)}
              {preset === 'sinceListed' && capped
                ? '. El reporte cubre hasta un año: la columna "desde el alta" igual cuenta todo.'
                : '.'}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Qué lleva</h3>
          <SwitchField
            id={`${id}-statistics`}
            label="Estadísticas de los portales"
            hint="Vistas, contactos y favoritos de cada aviso, con lo que significa cada uno."
            checked={statistics}
            disabled={pending}
            onChange={setStatistics}
          />
          <SwitchField
            id={`${id}-publications`}
            label="Publicaciones activas"
            hint="Dónde está publicada hoy, con el link a la web y a cada aviso."
            checked={publications}
            disabled={pending}
            onChange={setPublications}
          />
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
              <Label htmlFor={`${id}-agent`}>Incluir los datos del productor</Label>
            </div>
          )}
        </section>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || period.from === '' || period.to === ''}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Armar el reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
