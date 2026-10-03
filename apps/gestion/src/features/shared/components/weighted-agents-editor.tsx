'use client';

import { Button } from '@norde/ui/components/button';
import { Label } from '@norde/ui/components/label';
import { PagedCombobox } from '@norde/ui/components/paged-combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { XIcon } from 'lucide-react';

import { loadUserOptions } from '../../identity/actions';
import { weightShares } from '../weight-shares';

/** Un agente del reparto, con el nombre que se muestra. */
export interface WeightedAgentDraft {
  readonly userId: string;
  readonly label: string;
  readonly weight: number;
}

/**
 * Los agentes que reciben consultas, cada uno con su peso y la parte que le toca (reglas de
 * asignación y derivación por chances). Se agregan desde un buscador de usuarios.
 */
export function WeightedAgentsEditor({
  id,
  agents,
  onChange,
  maxAgents,
  minWeight,
  maxWeight,
  disabled = false,
}: {
  readonly id: string;
  readonly agents: readonly WeightedAgentDraft[];
  readonly onChange: (next: WeightedAgentDraft[]) => void;
  readonly maxAgents: number;
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly disabled?: boolean;
}) {
  const shares = weightShares(agents.map((a) => a.weight));
  const weights = Array.from({ length: maxWeight - minWeight + 1 }, (_, i) => minWeight + i);

  return (
    <div className="flex flex-col gap-3">
      {!disabled && agents.length < maxAgents && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id} className="text-xs">
            Agentes
          </Label>
          <PagedCombobox
            id={id}
            value={null}
            onChange={(next) => {
              if (next && !agents.some((a) => a.userId === next.value)) {
                onChange([...agents, { userId: next.value, label: next.label, weight: minWeight }]);
              }
            }}
            loadPage={loadUserOptions}
            placeholder="Agregar un agente"
            searchPlaceholder="Buscar usuario"
          />
        </div>
      )}
      {agents.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {agents.map((agent, index) => (
            <li key={agent.userId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{agent.label}</span>
              <Select
                value={String(agent.weight)}
                disabled={disabled}
                onValueChange={(value) => {
                  onChange(
                    agents.map((a) =>
                      a.userId === agent.userId ? { ...a, weight: Number(value) } : a,
                    ),
                  );
                }}
              >
                <SelectTrigger aria-label={`Peso de ${agent.label}`} className="w-[84px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weights.map((weight) => (
                    <SelectItem key={weight} value={String(weight)}>
                      {weight}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                {shares[index]}%
              </span>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar a ${agent.label}`}
                  onClick={() => {
                    onChange(agents.filter((a) => a.userId !== agent.userId));
                  }}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
