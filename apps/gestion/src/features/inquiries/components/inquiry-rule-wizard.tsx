'use client';

import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_CHANNEL_VALUES,
  MAX_INQUIRY_RULE_AGENTS,
  MAX_INQUIRY_RULE_NAME_LENGTH,
  MAX_INQUIRY_RULE_WEIGHT,
  MIN_INQUIRY_RULE_WEIGHT,
  type InquiryRuleRow,
} from '@norde/core/clients/contracts';
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
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { PagedCombobox, type LoadComboboxPage } from '@norde/ui/components/paged-combobox';
import { toast } from '@norde/ui/components/sonner';
import { cn } from '@norde/ui/lib/utils';
import { Loader2Icon, XIcon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { loadLocationOptions, loadPropertyOptions } from '../../properties/actions';
import { OPERATION_LABELS, PROPERTY_TYPE_LABELS } from '../../properties/labels';
import { FormAlert } from '../../shared/components/form-alert';
import { createInquiryRuleAction, updateInquiryRuleAction } from '../rule-actions';
import {
  WeightedAgentsEditor,
  type WeightedAgentDraft,
} from '../../shared/components/weighted-agents-editor';
import { weightShares } from '../../shared/weight-shares';
import { conditionLines } from '../rule-format';

const STEPS = ['Nombre', 'Condiciones', 'Agentes', 'Revisar'] as const;

interface Option {
  readonly id: string;
  readonly label: string;
}

interface Draft {
  readonly name: string;
  readonly channels: readonly string[];
  readonly operations: readonly string[];
  readonly propertyTypes: readonly string[];
  readonly neighborhoods: readonly string[];
  readonly properties: readonly Option[];
  /** Hasta #7 no hay selector de emprendimientos: se conservan los que ya tenía. */
  readonly developmentIds: readonly string[];
  readonly agents: readonly WeightedAgentDraft[];
}

const EMPTY: Draft = {
  name: '',
  channels: [],
  operations: [],
  propertyTypes: [],
  neighborhoods: [],
  properties: [],
  developmentIds: [],
  agents: [],
};

function fromRow(row: InquiryRuleRow): Draft {
  const c = row.conditions;
  return {
    name: row.name,
    channels: c.channels,
    operations: c.operations,
    propertyTypes: c.propertyTypes,
    neighborhoods: c.neighborhoods,
    properties: c.properties.map((p) => ({
      id: p.id,
      label:
        p.summary === undefined
          ? 'Ya no está en la cartera'
          : `${p.summary.code} · ${p.summary.title}`,
    })),
    developmentIds: c.developmentIds,
    agents: row.agents.map((a) => ({
      userId: a.user.id,
      label: a.user.name ?? 'Usuario inactivo',
      weight: a.weight,
    })),
  };
}

function toggle(values: readonly string[], value: string, on: boolean): string[] {
  return on ? [...values, value] : values.filter((v) => v !== value);
}

function CheckboxGroup({
  legend,
  options,
  value,
  onChange,
}: {
  readonly legend: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${option.value}`}
              checked={value.includes(option.value)}
              onCheckedChange={(checked) => {
                onChange(toggle(value, option.value, checked === true));
              }}
            />
            <Label htmlFor={`${id}-${option.value}`} className="text-sm font-normal">
              {option.label}
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function Chips({
  items,
  removeLabel,
  onRemove,
}: {
  readonly items: readonly Option[];
  readonly removeLabel: string;
  readonly onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-1 pl-2.5 text-xs"
        >
          <span className="truncate">{item.label}</span>
          <button
            type="button"
            aria-label={`${removeLabel}: ${item.label}`}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => {
              onRemove(item.id);
            }}
          >
            <XIcon className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Un selector paginado que agrega lo elegido a una lista y vuelve a quedar vacío. */
function AddPicker({
  id,
  label,
  loadPage,
  placeholder,
  searchPlaceholder,
  onAdd,
}: {
  readonly id: string;
  readonly label: string;
  readonly loadPage: LoadComboboxPage;
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  readonly onAdd: (option: Option) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <PagedCombobox
        id={id}
        value={null}
        onChange={(next) => {
          if (next) onAdd({ id: next.value, label: next.label });
        }}
        loadPage={loadPage}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
      />
    </div>
  );
}

/**
 * El asistente de una regla de asignación: nombre, condiciones, agentes con su peso y revisión.
 * Sin `rule` crea una nueva.
 */
export function InquiryRuleWizard({
  rule,
  onOpenChange,
}: {
  readonly rule: InquiryRuleRow | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(rule ? fromRow(rule) : EMPTY);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const nameOk = draft.name.trim() !== '';
  const agentsOk = draft.agents.length > 0;
  const canContinue = step === 0 ? nameOk : step === 2 ? agentsOk : true;
  const shares = weightShares(draft.agents.map((a) => a.weight));
  const lines = conditionLines({
    channels: CONTACT_CHANNEL_VALUES.filter((c) => draft.channels.includes(c)),
    operations: draft.operations,
    propertyTypes: draft.propertyTypes,
    neighborhoods: draft.neighborhoods,
    properties: [],
    developmentIds: draft.developmentIds,
  });

  function save() {
    const input = {
      name: draft.name,
      conditions: {
        channels: CONTACT_CHANNEL_VALUES.filter((c) => draft.channels.includes(c)),
        operations: [...draft.operations],
        propertyTypes: [...draft.propertyTypes],
        neighborhoods: [...draft.neighborhoods],
        propertyIds: draft.properties.map((p) => p.id),
        developmentIds: [...draft.developmentIds],
      },
      agents: draft.agents.map((a) => ({ userId: a.userId, weight: a.weight })),
    };
    startTransition(async () => {
      const message = await runAction(() =>
        rule === undefined
          ? createInquiryRuleAction(input)
          : updateInquiryRuleAction({ ruleId: rule.id, ...input }),
      );
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(rule === undefined ? 'Regla creada' : 'Regla guardada');
      onOpenChange(false);
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {rule === undefined ? 'Nueva regla de asignación' : 'Editar regla'}
          </DialogTitle>
          <DialogDescription>
            Las consultas que cumplen las condiciones se reparten entre los agentes según su peso.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex gap-1.5" aria-label="Pasos">
          {STEPS.map((title, index) => (
            <li
              key={title}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'flex-1 border-t-2 pt-1.5 text-xs text-muted-foreground',
                index <= step ? 'border-foreground' : 'border-border',
                index === step && 'font-medium text-foreground',
              )}
            >
              {index + 1}. {title}
            </li>
          ))}
        </ol>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          {step === 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-name`}>Nombre</Label>
              <Input
                id={`${id}-name`}
                value={draft.name}
                maxLength={MAX_INQUIRY_RULE_NAME_LENGTH}
                placeholder="Zonaprop · Palermo y Belgrano"
                onChange={(event) => {
                  set({ name: event.target.value });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Para reconocerla en la lista. Las reglas se evalúan en orden: la primera que
                coincide se queda con la consulta.
              </p>
            </div>
          )}

          {step === 1 && (
            <>
              <p className="text-xs text-muted-foreground">
                Sin condiciones, la regla toma cualquier consulta. Con varias, la consulta tiene que
                cumplir todas; dentro de cada una, alcanza con una opción.
              </p>
              <CheckboxGroup
                legend="Canal"
                options={CONTACT_CHANNEL_VALUES.map((value) => ({
                  value,
                  label: CONTACT_CHANNEL_LABELS[value] ?? value,
                }))}
                value={draft.channels}
                onChange={(channels) => {
                  set({ channels });
                }}
              />
              <CheckboxGroup
                legend="Operación de la propiedad"
                options={Object.entries(OPERATION_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                value={draft.operations}
                onChange={(operations) => {
                  set({ operations });
                }}
              />
              <CheckboxGroup
                legend="Tipo de propiedad"
                options={Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                value={draft.propertyTypes}
                onChange={(propertyTypes) => {
                  set({ propertyTypes });
                }}
              />
              <div className="flex flex-col gap-2">
                <AddPicker
                  id={`${id}-zone`}
                  label="Zona"
                  loadPage={loadLocationOptions}
                  placeholder="Agregar un barrio"
                  searchPlaceholder="Buscar barrio"
                  onAdd={(option) => {
                    if (!draft.neighborhoods.includes(option.label)) {
                      set({ neighborhoods: [...draft.neighborhoods, option.label] });
                    }
                  }}
                />
                <Chips
                  items={draft.neighborhoods.map((n) => ({ id: n, label: n }))}
                  removeLabel="Quitar la zona"
                  onRemove={(name) => {
                    set({ neighborhoods: draft.neighborhoods.filter((n) => n !== name) });
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <AddPicker
                  id={`${id}-property`}
                  label="Propiedad"
                  loadPage={loadPropertyOptions}
                  placeholder="Agregar una propiedad"
                  searchPlaceholder="Código, título o dirección"
                  onAdd={(option) => {
                    if (!draft.properties.some((p) => p.id === option.id)) {
                      set({ properties: [...draft.properties, option] });
                    }
                  }}
                />
                <Chips
                  items={draft.properties}
                  removeLabel="Quitar la propiedad"
                  onRemove={(propertyId) => {
                    set({ properties: draft.properties.filter((p) => p.id !== propertyId) });
                  }}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <WeightedAgentsEditor
                id={`${id}-agent`}
                agents={draft.agents}
                onChange={(agents) => {
                  set({ agents });
                }}
                maxAgents={MAX_INQUIRY_RULE_AGENTS}
                minWeight={MIN_INQUIRY_RULE_WEIGHT}
                maxWeight={MAX_INQUIRY_RULE_WEIGHT}
              />
              {draft.agents.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Agregá al menos un agente. Con varios, el peso dice cuántas consultas recibe cada
                  uno: con 2 recibe el doble que con 1.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Si el contacto ya tiene agente, la consulta va a él y no cuenta en el reparto.
              </p>
            </>
          )}

          {step === 3 && (
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Nombre</dt>
                <dd className="font-medium">{draft.name.trim()}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Toma</dt>
                <dd>
                  {lines.length === 0 && draft.properties.length === 0 ? (
                    'Cualquier consulta'
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {lines.map((line) => (
                        <li key={line.label}>
                          {line.label}: {line.values.join(', ')}
                        </li>
                      ))}
                      {draft.properties.length > 0 && (
                        <li>Propiedad: {draft.properties.map((p) => p.label).join(', ')}</li>
                      )}
                    </ul>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">La reparte entre</dt>
                <dd>
                  <ul className="flex flex-col gap-0.5">
                    {draft.agents.map((agent, index) => (
                      <li key={agent.userId}>
                        {agent.label}: peso {agent.weight} ({shares[index]}%)
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          )}
          <FormAlert message={error} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (step === 0) onOpenChange(false);
              else setStep(step - 1);
            }}
          >
            {step === 0 ? 'Cancelar' : 'Atrás'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={!canContinue}
              onClick={() => {
                setStep(step + 1);
              }}
            >
              Siguiente
            </Button>
          ) : (
            <Button type="button" disabled={pending} onClick={save}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              {rule === undefined ? 'Crear regla' : 'Guardar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
