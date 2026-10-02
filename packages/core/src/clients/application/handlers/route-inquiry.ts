import {
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { findRuleFor, inquiryRoutingFacts } from '../../domain/inquiry-assignment-rule';
import { assignInquiryIn, senderKeys, type AgentRef } from '../inquiry-assignment';
import { findInquiryForUpdate } from '../inquiry-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

/** Qué pasó con la consulta. Que quede pendiente no es un error: una persona la asigna. */
export type InquiryRouteOutcome =
  | {
      readonly routed: true;
      readonly ruleId: string;
      readonly clientId: string;
      readonly opportunityId: string;
      readonly agentId: string | undefined;
    }
  | {
      readonly routed: false;
      readonly reason:
        'not_found' | 'not_pending' | 'no_rule' | 'ambiguous_client' | 'no_active_agent';
    };

/**
 * El reparto automático: reacción a `clients.inquiry_received`. Busca la primera regla activa que
 * toma la consulta y se la asigna como "Asignar" desde la bandeja, sin una persona:
 *
 * - Si el teléfono o el email son de un contacto, va a él; si no, se crea uno.
 * - Si coinciden varios contactos distintos, queda pendiente: elige una persona.
 * - Si el contacto ya tiene agente, la oportunidad sigue con él y la regla no avanza su reparto.
 *   Si no, va al agente que toca por el reparto ponderado, entre los de la regla que siguen activos.
 * - Sin regla, o sin ningún agente activo en la regla, queda pendiente.
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

      const matched = findRuleFor(
        await tx.inquiryRules.findAll(),
        inquiryRoutingFacts(inquiry.toSnapshot()),
      );
      if (!matched) return ok({ routed: false, reason: 'no_rule' });

      const matches = await tx.clients.findMatching(senderKeys(inquiry));
      if (matches.length > 1) return ok({ routed: false, reason: 'ambiguous_client' });
      const [existing] = matches;

      let picked: AgentRef | undefined;
      if (existing?.ownership.ownerId === undefined) {
        // Bloqueada: dos consultas a la vez toman turnos distintos del reparto.
        const rule = await tx.inquiryRules.findForUpdate(matched.id);
        if (!rule) return ok({ routed: false, reason: 'no_rule' });
        const branches = new Map<string, string | undefined>();
        for (const { userId } of rule.toSnapshot().agents) {
          const agent = await this.deps.agents.find(userId);
          if (agent) branches.set(userId, agent.branchId);
        }
        const agentId = rule.assignNext(new Set(branches.keys()), now);
        if (agentId === undefined) return ok({ routed: false, reason: 'no_active_agent' });
        await tx.inquiryRules.save(rule, actor.id);
        picked = { agentId, branchId: branches.get(agentId) };
      }

      const output = await assignInquiryIn(
        tx,
        actor,
        { ids: this.deps.ids, now },
        {
          inquiry,
          existing,
          type: inquiry.suggestedOpportunityType,
          // Con agente, el contacto sigue con el suyo (el de la oportunidad que se abre o se suma).
          chooseAgent: (current) => Promise.resolve(picked ?? current),
          auditExtra: { ruleId: { before: null, after: matched.id } },
        },
      );
      return ok({
        routed: true,
        ruleId: matched.id,
        clientId: output.clientId,
        opportunityId: output.opportunityId,
        agentId: inquiry.toSnapshot().assignedAgentId,
      });
    });
  }
}
