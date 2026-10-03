'use client';

import {
  MAX_DEVELOPMENT_CHANCE_WEIGHT,
  MAX_DEVELOPMENT_CHANCES,
  MIN_DEVELOPMENT_CHANCE_WEIGHT,
  type DevelopmentDetail,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { useId, useState } from 'react';

import {
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../shared/components/inline-section';
import {
  WeightedAgentsEditor,
  type WeightedAgentDraft,
} from '../../shared/components/weighted-agents-editor';
import { weightShares } from '../../shared/weight-shares';
import { updateDevelopmentChancesAction } from '../actions';

const INACTIVE_USER = 'Usuario inactivo';

function drafts(detail: DevelopmentDetail): WeightedAgentDraft[] {
  return detail.chances.map((chance) => ({
    userId: chance.user.id,
    label: chance.user.name ?? INACTIVE_USER,
    weight: chance.weight,
  }));
}

/**
 * La derivación por chances (pestaña Derivación): qué agentes reciben las consultas del
 * emprendimiento y de sus unidades, y cuántas. Funciona aunque las reglas de asignación estén
 * apagadas.
 */
export function DevelopmentChancesSection({
  detail,
  canEdit,
}: {
  readonly detail: DevelopmentDetail;
  readonly canEdit: boolean;
}) {
  const shares = weightShares(detail.chances.map((chance) => chance.weight));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Las consultas por este emprendimiento o por sus unidades se reparten entre estos agentes
        según su peso: con 2 recibe el doble que con 1. Si quien consulta ya tiene un agente, la
        consulta va a él. Sin agentes, siguen el reparto general de la bandeja.
      </p>
      <InlineSection
        title="Derivación por chances"
        canEdit={canEdit}
        view={
          detail.chances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deriva consultas: quedan pendientes en la bandeja para asignar.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {detail.chances.map((chance, index) => (
                <li
                  key={chance.user.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {chance.user.name ?? (
                      <span className="text-muted-foreground">{INACTIVE_USER}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    Peso {chance.weight} · {shares[index]}%
                  </span>
                </li>
              ))}
            </ul>
          )
        }
        form={(controls) => <ChancesForm detail={detail} controls={controls} />}
      />
    </div>
  );
}

function ChancesForm({
  detail,
  controls,
}: {
  readonly detail: DevelopmentDetail;
  readonly controls: InlineFormControls;
}) {
  const id = useId();
  const [agents, setAgents] = useState<readonly WeightedAgentDraft[]>(() => drafts(detail));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        controls.save(
          () =>
            updateDevelopmentChancesAction({
              developmentId: detail.id,
              agents: agents.map((agent) => ({ userId: agent.userId, weight: agent.weight })),
            }),
          'Derivación guardada.',
        );
      }}
    >
      <WeightedAgentsEditor
        id={`${id}-agent`}
        agents={agents}
        onChange={setAgents}
        maxAgents={MAX_DEVELOPMENT_CHANCES}
        minWeight={MIN_DEVELOPMENT_CHANCE_WEIGHT}
        maxWeight={MAX_DEVELOPMENT_CHANCE_WEIGHT}
      />
      {agents.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin agentes, el emprendimiento no deriva sus consultas.
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={agents.length === 0}
          onClick={() => {
            setAgents([]);
          }}
        >
          Quitar todos
        </Button>
        <InlineFormActions controls={controls} />
      </div>
    </form>
  );
}
