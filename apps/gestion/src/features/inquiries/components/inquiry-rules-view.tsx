'use client';

import {
  INQUIRY_RULE_STATUS_VALUES,
  type InquiryRuleRow,
  type InquiryRuleStatusValue,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { toast } from '@norde/ui/components/sonner';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { cn } from '@norde/ui/lib/utils';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { userName } from '../../clients/client-format';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../shared/components/server-data-table';
import {
  deleteInquiryRuleAction,
  loadInquiryRuleAction,
  moveInquiryRuleAction,
  setInquiryRuleActiveAction,
} from '../rule-actions';
import { conditionLines } from '../rule-format';

import { InquiryRuleWizard } from './inquiry-rule-wizard';

const STATUS_LABELS: Readonly<Record<InquiryRuleStatusValue, string>> = {
  active: 'Activas',
  inactive: 'Inactivas',
};

const EMPTY_MESSAGES: Readonly<Record<InquiryRuleStatusValue, string>> = {
  active:
    'No hay reglas activas: las consultas que entran quedan pendientes hasta que alguien las asigna.',
  inactive: 'No hay reglas inactivas.',
};

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

/** El asistente abierto: una regla nueva o la que se edita. */
type Wizard = { readonly rule: InquiryRuleRow | undefined } | undefined;

function StatusTabs({ status }: { readonly status: InquiryRuleStatusValue }) {
  const { setParams } = useListNavigation();
  return (
    <div role="group" aria-label="Estado de las reglas" className="flex flex-wrap gap-2">
      {INQUIRY_RULE_STATUS_VALUES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={status === value}
          className={cn(
            'inline-flex items-center rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-secondary-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
            status === value &&
              'border-transparent bg-foreground text-background hover:bg-foreground',
          )}
          onClick={() => {
            setParams({ status: value === 'active' ? undefined : value });
          }}
        >
          {STATUS_LABELS[value]}
        </button>
      ))}
    </div>
  );
}

function RuleCard({
  rule,
  busy,
  onMove,
  onEdit,
  onAction,
}: {
  readonly rule: InquiryRuleRow;
  readonly busy: boolean;
  readonly onMove: (direction: 'up' | 'down') => void;
  readonly onEdit: () => void;
  readonly onAction: (action: PendingAction) => void;
}) {
  const lines = conditionLines(rule.conditions);
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="flex items-center gap-1 sm:flex-col">
        <span
          className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold tabular-nums"
          aria-label={`Prioridad ${String(rule.priority)}`}
        >
          {rule.priority}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Subir la prioridad de ${rule.name}`}
          disabled={!rule.canMoveUp || busy}
          onClick={() => {
            onMove('up');
          }}
        >
          <ArrowUpIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Bajar la prioridad de ${rule.name}`}
          disabled={!rule.canMoveDown || busy}
          onClick={() => {
            onMove('down');
          }}
        >
          <ArrowDownIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-sm font-semibold">{rule.name}</h3>
        <div className="text-xs text-muted-foreground sm:text-sm">
          {lines.length === 0 ? (
            'Toma cualquier consulta'
          ) : (
            <ul className="flex flex-col gap-0.5">
              {lines.map((line) => (
                <li key={line.label}>
                  <span className="text-foreground">{line.label}:</span> {line.values.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm" aria-label="Agentes">
          {rule.agents.map((agent) => (
            <li key={agent.user.id}>
              {userName(agent.user)}{' '}
              <span className="text-muted-foreground tabular-nums">
                · peso {agent.weight} ({agent.share}%)
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onEdit}>
          <PencilIcon className="h-4 w-4" />
          Editar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onAction(
              rule.isActive
                ? {
                    copy: {
                      title: 'Desactivar regla',
                      description: `"${rule.name}" deja de tomar consultas. Conserva su lugar y su reparto.`,
                      confirm: 'Desactivar',
                      done: 'Regla desactivada',
                    },
                    run: () => setInquiryRuleActiveAction({ ruleId: rule.id, active: false }),
                  }
                : {
                    copy: {
                      title: 'Activar regla',
                      description: `"${rule.name}" vuelve a tomar las consultas que cumplen sus condiciones.`,
                      confirm: 'Activar',
                      done: 'Regla activada',
                    },
                    run: () => setInquiryRuleActiveAction({ ruleId: rule.id, active: true }),
                  },
            );
          }}
        >
          {rule.isActive ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          {rule.isActive ? 'Desactivar' : 'Activar'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onAction({
              copy: {
                title: 'Borrar regla',
                description: `"${rule.name}" se borra. Las consultas que ya repartió no cambian.`,
                confirm: 'Borrar',
                done: 'Regla borrada',
                destructive: true,
              },
              run: () => deleteInquiryRuleAction({ ruleId: rule.id }),
            });
          }}
        >
          <Trash2Icon className="h-4 w-4" />
          Borrar
        </Button>
      </div>
    </li>
  );
}

export interface InquiryRulesViewProps {
  readonly rows: readonly InquiryRuleRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly status: InquiryRuleStatusValue;
}

function RulesBody({ rows, total, page, pageSize, status }: InquiryRulesViewProps) {
  const { setParams, pending } = useListNavigation();
  const [action, setAction] = useState<PendingAction | undefined>();
  const [wizard, setWizard] = useState<Wizard>();
  const [busy, startTransition] = useTransition();

  function run(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      const message = await runAction(work);
      if (message !== undefined) toast.error(message);
    });
  }

  function edit(ruleId: string) {
    startTransition(async () => {
      try {
        const result = await loadInquiryRuleAction({ ruleId });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setWizard({ rule: result.value });
      } catch {
        toast.error('No pudimos abrir la regla. Probá de nuevo.');
      }
    });
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <StatusTabs status={status} />
        <div className="flex items-center gap-3">
          {(pending || busy) && (
            <Loader2Icon
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-label="Cargando"
            />
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setWizard({ rule: undefined });
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Nueva regla
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {EMPTY_MESSAGES[status]}
        </p>
      ) : (
        <ul
          aria-label={`Reglas ${STATUS_LABELS[status].toLowerCase()}`}
          className={cn('divide-y divide-border', pending && 'opacity-60')}
        >
          {rows.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              busy={busy}
              onMove={(direction) => {
                run(() => moveInquiryRuleAction({ ruleId: rule.id, direction }));
              }}
              onEdit={() => {
                edit(rule.id);
              }}
              onAction={setAction}
            />
          ))}
        </ul>
      )}
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => {
          setParams({ page: next });
        }}
        onPageSizeChange={(next) => {
          setParams({ pageSize: next });
        }}
      />
      {wizard && (
        <InquiryRuleWizard
          key={wizard.rule?.id ?? 'new'}
          rule={wizard.rule}
          onOpenChange={(open) => {
            if (!open) setWizard(undefined);
          }}
        />
      )}
      <ConfirmActionDialog
        copy={action?.copy}
        run={action?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setAction(undefined);
        }}
      />
    </div>
  );
}

/** Las reglas de asignación automática: pestañas, prioridad y asistente. */
export function InquiryRulesView(props: InquiryRulesViewProps) {
  return (
    <ListNavigationProvider>
      <RulesBody {...props} />
    </ListNavigationProvider>
  );
}
