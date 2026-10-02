'use client';

import {
  OPPORTUNITY_RULE_LABELS,
  OPPORTUNITY_RULE_VALUES,
  OPPORTUNITY_STATUS_LABELS,
  type OpportunityConfiguration,
  type OpportunityRuleValue,
  type OpportunityStageRow,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Label } from '@norde/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { updateOpportunitySettingsAction } from '../actions';

import { ColorDot } from './catalog-pieces';

const NO_RULE = 'none';
const CLOSED: readonly string[] = ['won', 'lost'];

/** Los estados que puede elegir una regla: activos, de una categoría abierta. */
function optionsFor(
  rule: OpportunityRuleValue,
  stages: readonly OpportunityStageRow[],
): readonly OpportunityStageRow[] {
  return stages.filter(
    (stage) =>
      stage.isActive &&
      !CLOSED.includes(stage.category) &&
      !(rule === 'onCreate' && stage.category === 'referred_to_partner'),
  );
}

/**
 * El estado que aplica cada regla automática. Las de envíos y reacciones (tras enviar email o
 * WhatsApp, "me gusta" / "no me gusta") llegan con los envíos de fichas (#11).
 */
export function OpportunityRulesForm({
  config,
  disabled,
}: {
  readonly config: OpportunityConfiguration;
  readonly disabled: boolean;
}) {
  const id = useId();
  const [rules, setRules] = useState(config.rules);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function save() {
    setError(undefined);
    startTransition(async () => {
      const message = await runAction(() => updateOpportunitySettingsAction({ ...rules }));
      if (message === undefined) toast.success('Reglas guardadas');
      else setError(message);
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <FormAlert message={error} />
      <div className="grid gap-5 md:grid-cols-2">
        {OPPORTUNITY_RULE_VALUES.map((rule) => {
          const options = optionsFor(rule, config.stages);
          const value = rules[rule] ?? NO_RULE;
          return (
            <div key={rule} className="flex flex-col gap-2">
              <Label htmlFor={`${id}-${rule}`}>{OPPORTUNITY_RULE_LABELS[rule].label}</Label>
              <Select
                value={value}
                disabled={disabled || pending}
                onValueChange={(next) => {
                  setRules((current) => ({ ...current, [rule]: next === NO_RULE ? null : next }));
                }}
              >
                <SelectTrigger id={`${id}-${rule}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RULE}>
                    {rule === 'onCreate' ? 'El primero de "Nueva"' : 'No cambia el estado'}
                  </SelectItem>
                  {options.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <ColorDot color={stage.color} />
                      {stage.name}
                      <span className="text-muted-foreground">
                        · {OPPORTUNITY_STATUS_LABELS[stage.category]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{OPPORTUNITY_RULE_LABELS[rule].hint}</p>
            </div>
          );
        })}
      </div>
      {!disabled && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Guardar reglas
          </Button>
        </div>
      )}
    </form>
  );
}
