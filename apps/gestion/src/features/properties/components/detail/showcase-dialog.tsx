'use client';

import {
  SHOWCASE_DESCRIPTION_SIZE_RANGE,
  SHOWCASE_OPTION_DEFAULTS,
  SHOWCASE_ORIENTATION_VALUES,
  SHOWCASE_PHOTO_COUNT_VALUES,
  ShowcaseOptionsInputSchema,
  type ShowcaseOrientationValue,
  type ShowcasePhotoCountValue,
} from '@norde/core/properties/contracts';
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
import { toast } from '@norde/ui/components/sonner';
import { Switch } from '@norde/ui/components/switch';
import { cn } from '@norde/ui/lib/utils';
import { ImageOffIcon, Loader2Icon, PresentationIcon, RotateCcwIcon } from 'lucide-react';
import { useEffect, useId, useState, useTransition } from 'react';

import { runAction } from '../../../../lib/action-result';
import { mediaFileHref } from '../../../media/paths';
import { FormAlert } from '../../../shared/components/form-alert';
import { loadPdfExportOptionsAction } from '../../actions';
import {
  loadShowcasePhotosAction,
  requestPropertyDocumentAction,
  type ShowcasePhotoOption,
} from '../../detail-actions';
import { SHOWCASE_ORIENTATION_LABELS } from '../../detail-labels';

/** Las opciones de la última vidriera (sin las fotos, que son de cada propiedad). */
const LAST_OPTIONS_KEY = 'norde-showcase-pdf-options';

const RememberedSchema = ShowcaseOptionsInputSchema.omit({ photoIds: true });

interface Choice {
  readonly orientation: ShowcaseOrientationValue;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly qr: boolean;
  readonly operationBand: boolean;
  readonly photoCount: ShowcasePhotoCountValue;
  readonly descriptionSize: number;
}

const DEFAULT_CHOICE: Choice = {
  orientation: SHOWCASE_OPTION_DEFAULTS.orientation,
  primaryColor: SHOWCASE_OPTION_DEFAULTS.primaryColor,
  secondaryColor: SHOWCASE_OPTION_DEFAULTS.secondaryColor,
  qr: SHOWCASE_OPTION_DEFAULTS.qr,
  operationBand: SHOWCASE_OPTION_DEFAULTS.operationBand,
  photoCount: SHOWCASE_OPTION_DEFAULTS.photoCount,
  descriptionSize: SHOWCASE_OPTION_DEFAULTS.descriptionSize,
};

/** La última elección de este navegador; si no hay o no es válida, la de la marca. */
function rememberedChoice(): Choice {
  try {
    const stored = window.localStorage.getItem(LAST_OPTIONS_KEY);
    if (stored === null) return DEFAULT_CHOICE;
    const parsed = RememberedSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : DEFAULT_CHOICE;
  } catch {
    // Sin acceso al almacenamiento o con algo ilegible: las opciones de la marca.
    return DEFAULT_CHOICE;
  }
}

function remember(choice: Choice): void {
  try {
    window.localStorage.setItem(LAST_OPTIONS_KEY, JSON.stringify(choice));
  } catch {
    // Sin acceso al almacenamiento: la próxima vez arranca con las de la marca.
  }
}

/** Un esquema chico de la hoja, vertical u horizontal. */
function OrientationSketch({ orientation }: { readonly orientation: ShowcaseOrientationValue }) {
  const block = 'rounded-[1px]';
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 gap-1 rounded-md border border-border bg-background p-1.5',
        orientation === 'landscape' ? 'h-12 w-16 flex-row' : 'h-16 w-12 flex-col',
      )}
    >
      {orientation === 'landscape' ? (
        <>
          <span className={cn('flex-1 bg-primary/40', block)} />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="h-1.5 w-3/4 rounded-[1px] bg-foreground/50" />
            <span className={cn('flex-1 bg-muted-foreground/25', block)} />
            <span className="h-1.5 w-1/2 rounded-[1px] bg-primary/60" />
          </span>
        </>
      ) : (
        <>
          <span className={cn('h-5 bg-primary/40', block)} />
          <span className="h-1.5 w-3/4 rounded-[1px] bg-foreground/50" />
          <span className={cn('flex-1 bg-muted-foreground/25', block)} />
          <span className="h-1.5 w-1/2 rounded-[1px] bg-primary/60" />
        </>
      )}
    </span>
  );
}

function ColorField({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5 disabled:cursor-not-allowed"
      />
      <div className="flex min-w-0 flex-col">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {hint} · <span className="font-mono uppercase">{value}</span>
        </span>
      </div>
    </div>
  );
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
 * Las opciones del PDF de vidriera (#175), las de Tokko: vertical u horizontal, 1 o 3 fotos (y
 * cuáles), colores, QR, banda con la operación y tamaño de letra. Recuerda la última elección.
 */
export function ShowcaseDocumentDialog({
  propertyId,
  open,
  onOpenChange,
  onRequested,
}: {
  readonly propertyId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRequested: () => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<Choice>(DEFAULT_CHOICE);
  const [photoIds, setPhotoIds] = useState<readonly string[]>([]);
  const [photos, setPhotos] = useState<readonly ShowcasePhotoOption[] | undefined>();
  const [askAgent, setAskAgent] = useState(false);
  const [includeAgent, setIncludeAgent] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let active = true;
    // Al abrir: la última elección, las fotos de esta propiedad y si hay que preguntar el agente.
    const restore = setTimeout(() => {
      if (!active) return;
      setChoice(rememberedChoice());
      setPhotoIds([]);
      setError(undefined);
    }, 0);
    void Promise.all([loadPdfExportOptionsAction(), loadShowcasePhotosAction(propertyId)]).then(
      ([options, loaded]) => {
        if (!active) return;
        setAskAgent(options.askAgent);
        if (loaded.ok) setPhotos(loaded.value);
        else setError(loaded.message);
      },
    );
    return () => {
      active = false;
      clearTimeout(restore);
    };
  }, [open, propertyId]);

  function change(patch: Partial<Choice>) {
    setChoice((current) => ({ ...current, ...patch }));
  }

  function togglePhoto(photoId: string) {
    setPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((chosen) => chosen !== photoId)
        : current.length < choice.photoCount
          ? [...current, photoId]
          : current,
    );
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const message = await runAction(() =>
        requestPropertyDocumentAction({
          propertyId,
          kind: 'showcase',
          options: { ...choice, photoIds: photoIds.slice(0, choice.photoCount) },
          ...(askAgent ? { includeAgent } : {}),
        }),
      );
      if (message !== undefined) {
        setError(message);
        return;
      }
      remember(choice);
      toast.success('Estamos armando el PDF de vidriera.');
      onRequested();
      onOpenChange(false);
    });
  }

  const full = photoIds.length >= choice.photoCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle icon={PresentationIcon}>PDF de vidriera</DialogTitle>
          <DialogDescription>
            Una hoja para la vidriera de la sucursal. Tarda unos segundos en armarse y queda en los
            PDF de la propiedad.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Hoja</h3>
          <div role="radiogroup" aria-label="Hoja" className="grid grid-cols-2 gap-2">
            {SHOWCASE_ORIENTATION_VALUES.map((orientation) => {
              const checked = orientation === choice.orientation;
              return (
                <button
                  key={orientation}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={pending}
                  onClick={() => {
                    change({ orientation });
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60',
                    checked
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/5',
                  )}
                >
                  <OrientationSketch orientation={orientation} />
                  <span className="text-sm font-semibold">
                    {SHOWCASE_ORIENTATION_LABELS[orientation]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Fotos</h3>
            <div role="radiogroup" aria-label="Cantidad de fotos" className="flex gap-1">
              {SHOWCASE_PHOTO_COUNT_VALUES.map((count) => (
                <Button
                  key={count}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={choice.photoCount === count}
                  variant={choice.photoCount === count ? 'default' : 'outline'}
                  disabled={pending}
                  onClick={() => {
                    change({ photoCount: count });
                    setPhotoIds((current) => current.slice(0, count));
                  }}
                >
                  {count === 1 ? '1 foto' : `${count.toString()} fotos`}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tocá las que quieras, en orden: la primera es la grande. Si no elegís, van las primeras
            de la ficha. Solo aparecen las marcadas para el PDF.
          </p>
          {photos === undefined ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              Cargando las fotos…
            </div>
          ) : photos.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              <ImageOffIcon className="size-4" aria-hidden />
              No hay fotos marcadas para el PDF: la vidriera sale sin fotos.
            </div>
          ) : (
            <ul className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {photos.map((photo) => {
                const order = photoIds.indexOf(photo.id);
                const chosen = order >= 0;
                const src = mediaFileHref({ kind: 'property', id: propertyId }, photo.id);
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      aria-label={chosen ? `Foto elegida ${(order + 1).toString()}` : 'Elegir foto'}
                      disabled={pending || (!chosen && full)}
                      onClick={() => {
                        togglePhoto(photo.id);
                      }}
                      className={cn(
                        'relative block aspect-[4/3] w-full overflow-hidden rounded-lg border-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed',
                        chosen ? 'border-primary' : 'border-transparent',
                        !chosen && full && 'opacity-40',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida por la ficha; next/image no aporta */}
                      <img
                        src={`${src}?v=${photo.hasThumbnail ? 'thumbnail' : 'original'}`}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {chosen && (
                        <span className="absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                          {order + 1}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Colores</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                change({
                  primaryColor: DEFAULT_CHOICE.primaryColor,
                  secondaryColor: DEFAULT_CHOICE.secondaryColor,
                });
              }}
            >
              <RotateCcwIcon className="size-3.5" aria-hidden />
              Los de la marca
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField
              id={`${id}-primary`}
              label="Principal"
              hint="Banda, precio e íconos"
              value={choice.primaryColor}
              disabled={pending}
              onChange={(primaryColor) => {
                change({ primaryColor });
              }}
            />
            <ColorField
              id={`${id}-secondary`}
              label="Secundario"
              hint="Franja de contacto"
              value={choice.secondaryColor}
              disabled={pending}
              onChange={(secondaryColor) => {
                change({ secondaryColor });
              }}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Contenido</h3>
          <SwitchField
            id={`${id}-band`}
            label="Banda con la operación"
            hint="“VENTA” o “ALQUILER” sobre la foto, en el color principal."
            checked={choice.operationBand}
            disabled={pending}
            onChange={(operationBand) => {
              change({ operationBand });
            }}
          />
          <SwitchField
            id={`${id}-qr`}
            label="Código QR a la ficha web"
            hint="Solo sale si la propiedad está publicada en la web."
            checked={choice.qr}
            disabled={pending}
            onChange={(qr) => {
              change({ qr });
            }}
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${id}-size`}>Tamaño de letra de la descripción</Label>
              <span className="text-sm font-semibold tabular-nums">{choice.descriptionSize}</span>
            </div>
            <input
              id={`${id}-size`}
              type="range"
              min={SHOWCASE_DESCRIPTION_SIZE_RANGE.min}
              max={SHOWCASE_DESCRIPTION_SIZE_RANGE.max}
              step={1}
              value={choice.descriptionSize}
              disabled={pending}
              onChange={(event) => {
                change({ descriptionSize: Number(event.target.value) });
              }}
              className="w-full accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              Si la descripción no entra, la letra se achica sola para que no se corte.
            </span>
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
        </section>

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
          <Button type="button" disabled={pending} onClick={submit}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Armar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
