import {
  err,
  ok,
  type Actor,
  type AuditChanges,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { Client } from '../../domain/client';
import {
  findRuleFor,
  inquiryRoutingFacts,
  type InquiryAssignmentRule,
} from '../../domain/inquiry-assignment-rule';
import { assignInquiryIn, senderKeys, type AgentRef } from '../inquiry-assignment';
import { findInquiryForUpdate } from '../inquiry-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';

/** Quién se quedó con la consulta: las chances de su emprendimiento o una regla. */
export type InquiryRoute =
  | { readonly kind: 'development_chances'; readonly developmentId: string }
  | { readonly kind: 'rule'; readonly ruleId: string };

/** Qué pasó con la consulta. Que quede pendiente no es un error: una persona la asigna. */
export type InquiryRouteOutcome =
  | {
      readonly routed: true;
      readonly by: InquiryRoute;
      readonly clientId: string;
      readonly opportunityId: string;
      readonly agentId: string | undefined;
    }
  | {
      readonly routed: false;
      readonly reason:
        'not_found' | 'not_pending' | 'no_rule' | 'ambiguous_client' | 'no_active_agent';
    };

/** Lo que eligió el reparto: por dónde y, si el contacto no tenía agente, a quién. */
interface RoutePick {
  readonly by: InquiryRoute;
  readonly agent: AgentRef | undefined;
}

/**
 * El reparto automático: reacción a `clients.inquiry_received`. Se la asigna como "Asignar" desde
 * la bandeja, sin una persona:
 *
 * 1. Si la consulta es por un emprendimiento (o una de sus unidades) que deriva por chances, va a
 *    los agentes del emprendimiento según su peso. Funciona aunque las reglas estén apagadas.
 * 2. Si no, la primera regla activa que la toma, si las reglas están prendidas.
 *
 * - Si el teléfono o el email son de un contacto, va a él; si no, se crea uno.
 * - Si coinciden varios contactos distintos, queda pendiente: elige una persona.
 * - Si el contacto ya tiene agente, la oportunidad sigue con él y el reparto no avanza.
 *   Si no, va al agente que toca por el reparto ponderado, entre los que siguen activos.
 * - Sin chances ni regla, o sin ningún agente activo, queda pendiente. Un emprendimiento sin
 *   agentes activos deja la consulta a las reglas.
 *
 * Es idempotente: una consulta que ya no está pendiente no se toca, aunque el evento llegue dos
 * veces. Solo la ejecuta el sistema (`inquiries:route`).
 */
export class RouteInquiry {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
      /** Las reglas de asignación (#10) van detrás de un flag; las chances, no. Por defecto, sí. */
      readonly rulesEnabled?: boolean;
    },
  ) {}

  async execute(
    event: { readonly inquiryId: string },
    actor: Actor,
  ): Promise<Result<InquiryRouteOutcome, ForbiddenError>> {
    if (actor.kind !== 'system' || !actor.can('inquiries:route')) {
      return err({ type: 'Forbidden' });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<InquiryRouteOutcome, never>> => {
      const inquiry = await findInquiryForUpdate(tx.inquiries, event.inquiryId);
      if (!inquiry) return ok({ routed: false, reason: 'not_found' });
      if (inquiry.status !== 'pending') return ok({ routed: false, reason: 'not_pending' });

      const snapshot = inquiry.toSnapshot();
      const { developmentId } = snapshot;
      const chances =
        developmentId === undefined ? [] : await tx.developmentChances.agentsOf(developmentId);
      const rule =
        (this.deps.rulesEnabled ?? true)
          ? findRuleFor(await tx.inquiryRules.findAll(), inquiryRoutingFacts(snapshot))
          : undefined;
      if (chances.length === 0 && !rule) return ok({ routed: false, reason: 'no_rule' });

      const matches = await tx.clients.findMatching(senderKeys(inquiry));
      if (matches.length > 1) return ok({ routed: false, reason: 'ambiguous_client' });
      const [existing] = matches;

      let picked: RoutePick | undefined;
      if (developmentId !== undefined && chances.length > 0) {
        picked = await this.byChances(tx, developmentId, chances, existing);
      }
      if (!picked && rule) picked = await this.byRule(tx, actor, rule, existing, now);
      if (!picked) return ok({ routed: false, reason: 'no_active_agent' });

      const { by, agent } = picked;
      const output = await assignInquiryIn(
        tx,
        actor,
        { ids: this.deps.ids, now },
        {
          inquiry,
          existing,
          type: inquiry.suggestedOpportunityType,
          // Con agente, el contacto sigue con el suyo (el de la oportunidad que se abre o se suma).
          chooseAgent: (current) => Promise.resolve(agent ?? current),
          auditExtra: routeAudit(by),
        },
      );
      return ok({
        routed: true,
        by,
        clientId: output.clientId,
        opportunityId: output.opportunityId,
        agentId: inquiry.toSnapshot().assignedAgentId,
      });
    });
  }

  /** Las chances del emprendimiento. `undefined` si ninguno de sus agentes está activo. */
  private async byChances(
    tx: ClientsTransaction,
    developmentId: string,
    chances: readonly string[],
    existing: Client | undefined,
  ): Promise<RoutePick | undefined> {
    const by = { kind: 'development_chances', developmentId } as const;
    if (existing?.ownership.ownerId !== undefined) return { by, agent: undefined };
    const branches = await this.activeBranches(chances);
    const agentId = await tx.developmentChances.takeTurn(developmentId, new Set(branches.keys()));
    if (agentId === undefined) return undefined;
    return { by, agent: { agentId, branchId: branches.get(agentId) } };
  }

  /** La regla que toma la consulta. `undefined` si ninguno de sus agentes está activo. */
  private async byRule(
    tx: ClientsTransaction,
    actor: Actor,
    matched: InquiryAssignmentRule,
    existing: Client | undefined,
    now: Date,
  ): Promise<RoutePick | undefined> {
    const by = { kind: 'rule', ruleId: matched.id } as const;
    if (existing?.ownership.ownerId !== undefined) return { by, agent: undefined };
    // Bloqueada: dos consultas a la vez toman turnos distintos del reparto.
    const rule = await tx.inquiryRules.findForUpdate(matched.id);
    if (!rule) return undefined;
    const branches = await this.activeBranches(rule.toSnapshot().agents.map((a) => a.userId));
    const agentId = rule.assignNext(new Set(branches.keys()), now);
    if (agentId === undefined) return undefined;
    await tx.inquiryRules.save(rule, actor.id);
    return { by, agent: { agentId, branchId: branches.get(agentId) } };
  }

  /** Los agentes activos de la lista, con su sucursal. */
  private async activeBranches(
    userIds: readonly string[],
  ): Promise<Map<string, string | undefined>> {
    const branches = new Map<string, string | undefined>();
    for (const userId of userIds) {
      const agent = await this.deps.agents.find(userId);
      if (agent) branches.set(userId, agent.branchId);
    }
    return branches;
  }
}

/** Qué repartió la consulta, en el historial de la asignación. */
function routeAudit(by: InquiryRoute): AuditChanges {
  return by.kind === 'rule'
    ? { ruleId: { before: null, after: by.ruleId } }
    : { developmentChances: { before: null, after: by.developmentId } };
}
