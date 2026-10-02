import {
  accessScope,
  canActOn,
  OWNERSHIP_RULES,
  visibilityFilter,
  type OwnedTarget,
} from '../../identity';
import {
  toAuditValue,
  type Actor,
  type AuditState,
  type AuditTarget,
  type IdGenerator,
} from '../../shared';
import type {
  ClientTypeValue,
  ContactChannelValue,
  OpportunityActions,
  OpportunityPipelineRow,
  OpportunityStatusValue,
} from '../contracts';
import { statusChangeActivity } from '../domain/client-activity';
import { maskPhone } from '../domain/contact-masking';
import type { Opportunity } from '../domain/opportunity';
import type { CloseReasonRef } from '../domain/opportunity-close-reason';
import {
  reachableStages,
  usableCloseReasons,
  type StagePosition,
} from '../domain/opportunity-moves';
import type { StageRef } from '../domain/opportunity-stage';
import { isOpenStatus } from '../domain/opportunity-status';
import { stageTenure } from '../domain/opportunity-tenure';

import { dayRange, masksOwnerContact } from './client-support';
import type { ClientAgents } from './ports/client-agents';
import type { ClientListings } from './ports/client-record-query';
import type { ClientsTransaction, ClientsUnitOfWork } from './ports/clients-transaction';
import type {
  OpportunityFilterCriteria,
  OpportunityPipelineItem,
} from './ports/opportunity-pipeline-query';
import { userNames, userRef } from './record-support';
import { idOf } from './tag-support';

// Lo que comparten el pipeline y las acciones sobre una oportunidad.

export interface OpportunityNotFoundError {
  readonly type: 'OpportunityNotFound';
}

/** Va en el historial de la oportunidad y, por `clientIds`, se suprime con el cliente. */
export function opportunityTarget(action: string, opportunity: Opportunity): AuditTarget {
  return {
    action,
    entityType: 'opportunity',
    entityId: opportunity.id,
    clientIds: [opportunity.clientId],
  };
}

/** Lo que se audita de una oportunidad. Las notas quedan en la actividad del cliente. */
export function opportunityAuditState(opportunity: Opportunity): AuditState {
  const s = opportunity.toSnapshot();
  return {
    clientId: s.clientId,
    originChannel: s.originChannel,
    type: s.type,
    intent: s.intent,
    status: s.status,
    stageId: s.stageId,
    agentId: s.agentId,
    branchId: s.branchId,
    closeReasonId: s.closeReasonId,
    closedAt: s.closedAt?.toISOString(),
    propertyId: s.propertyId,
    search: toAuditValue(s.search),
  };
}

export async function findOpportunity(
  tx: ClientsTransaction,
  rawId: string,
): Promise<Opportunity | undefined> {
  const id = idOf<'Opportunity'>(rawId);
  return id === undefined ? undefined : tx.opportunities.findById(id);
}

/** Puede ver al menos sus oportunidades. */
export function canReadOpportunities(actor: Actor): boolean {
  return accessScope(actor, OWNERSHIP_RULES.opportunitiesRead) !== undefined;
}

/** Cambiar el estado o cerrar esta oportunidad. */
export function canUpdateOpportunity(actor: Actor, ownership: OwnedTarget): boolean {
  return canActOn(actor, OWNERSHIP_RULES.opportunitiesUpdate, ownership);
}

/** Reasignar esta oportunidad: el permiso y poder verla. */
export function canReassignOpportunity(actor: Actor, ownership: OwnedTarget): boolean {
  return (
    actor.can('opportunities:reassign') &&
    canActOn(actor, OWNERSHIP_RULES.opportunitiesRead, ownership)
  );
}

/** Los catálogos con los que se decide a dónde puede ir cada oportunidad (con tope de dominio). */
export interface OpportunityCatalog {
  readonly stages: readonly StageRef[];
  readonly reasons: readonly CloseReasonRef[];
}

export async function loadOpportunityCatalog(uow: ClientsUnitOfWork): Promise<OpportunityCatalog> {
  return uow.run(async (tx) => {
    // Una transacción es una sola conexión: las consultas van de a una.
    const stages = await tx.stages.findAll();
    const reasons = await tx.closeReasons.findAll();
    return { stages: stages.map((s) => s.ref()), reasons: reasons.map((r) => r.ref()) };
  });
}

/** Qué puede hacer el actor con una oportunidad: permisos más lo que permite el dominio. */
export function opportunityActions(
  actor: Actor,
  opportunity: StagePosition & { readonly ownership: OwnedTarget },
  catalog: OpportunityCatalog,
): OpportunityActions {
  const open = isOpenStatus(opportunity.status);
  const update = open && canUpdateOpportunity(actor, opportunity.ownership);
  return {
    update,
    reassign: open && canReassignOpportunity(actor, opportunity.ownership),
    moveTo: update ? reachableStages(opportunity, catalog.stages).map((s) => s.id) : [],
    closeWith: update
      ? usableCloseReasons(opportunity.status, catalog.reasons, catalog.stages).map((r) => r.id)
      : [],
  };
}

/** Dónde está la oportunidad ahora: antes de moverla, para la actividad del cliente. */
export function stagePositionOf(opportunity: Opportunity): StagePosition {
  return { stageId: opportunity.stageId, status: opportunity.status };
}

/**
 * Guarda la oportunidad con sus cambios de estado, sus eventos y, por cada cambio, la entrada en
 * la actividad del cliente.
 */
export async function saveOpportunity(
  tx: ClientsTransaction,
  opportunity: Opportunity,
  actor: Actor,
  ids: IdGenerator,
  now: Date,
  from: StagePosition,
): Promise<void> {
  const events = opportunity.pullEvents();
  await tx.opportunities.save(opportunity, actor.id);
  await tx.events.publish(events);
  if (events.some((event) => event.type === 'clients.opportunity_status_changed')) {
    await tx.activities.add(
      statusChangeActivity({
        id: ids.next(),
        clientId: opportunity.clientId,
        opportunityId: opportunity.id,
        from,
        to: { stageId: opportunity.stageId, status: opportunity.status },
        actorId: actor.id,
        now,
      }),
      actor.id,
    );
  }
}

/** Los filtros del pipeline ya validados por el contract. */
export interface ParsedOpportunityFilter {
  readonly q?: string | undefined;
  readonly agentId?: string | undefined;
  readonly branchId?: string | undefined;
  readonly tagId?: string | undefined;
  readonly originChannel?: ContactChannelValue | undefined;
  readonly category?: OpportunityStatusValue | undefined;
  readonly createdFrom?: string | undefined;
  readonly createdTo?: string | undefined;
  readonly updatedFrom?: string | undefined;
  readonly updatedTo?: string | undefined;
}

/** Traduce los filtros a criterios del puerto: la visibilidad sale de los permisos del actor. */
export function resolveOpportunityFilter(
  filter: ParsedOpportunityFilter,
  actor: Actor,
): OpportunityFilterCriteria {
  return {
    visibility: visibilityFilter(actor, OWNERSHIP_RULES.opportunitiesRead),
    text: filter.q,
    agentId: filter.agentId,
    branchId: filter.branchId,
    tagId: filter.tagId,
    originChannel: filter.originChannel,
    category: filter.category,
    created: dayRange(filter.createdFrom, filter.createdTo),
    updated: dayRange(filter.updatedFrom, filter.updatedTo),
  };
}

function maskedPhone(
  phone: string | undefined,
  clientTypes: readonly ClientTypeValue[],
  actor: Actor,
) {
  const masked = masksOwnerContact(actor, clientTypes);
  return { masked, phone: masked && phone !== undefined ? maskPhone(phone) : phone };
}

/**
 * Las filas de una página: nombres de agentes, propiedades que el actor ve, vigencia, teléfonos de
 * propietarios enmascarados y qué puede hacer con cada una.
 */
export async function toPipelineRows(
  items: readonly OpportunityPipelineItem[],
  deps: { readonly agents: ClientAgents; readonly listings: ClientListings },
  actor: Actor,
  context: { readonly now: Date; readonly catalog: OpportunityCatalog },
): Promise<OpportunityPipelineRow[]> {
  const propertyIds = [
    ...new Set(items.map((item) => item.propertyId).filter((id) => id !== undefined)),
  ];
  const [names, listings] = await Promise.all([
    userNames(
      deps.agents,
      items.map((item) => item.agentId),
    ),
    propertyIds.length === 0
      ? Promise.resolve(new Map<string, { id: string; code: string; title: string }>())
      : deps.listings.summaries(propertyIds, actor),
  ]);

  return items.map((item): OpportunityPipelineRow => {
    const ownership = { ownerId: item.agentId, ownerBranchId: item.branchId };
    const contact = maskedPhone(item.clientPhone, item.clientTypes, actor);
    const listing = item.propertyId === undefined ? undefined : listings.get(item.propertyId);
    const open = isOpenStatus(item.status);
    return {
      id: item.id,
      client: {
        id: item.clientId,
        kind: item.clientKind,
        name: item.clientName,
        phone: contact.phone,
        contactMasked: contact.masked,
      },
      type: item.type,
      intent: item.intent,
      originChannel: item.originChannel,
      status: item.status,
      stageId: item.stageId,
      open,
      propertyId: item.propertyId,
      property: listing && { id: listing.id, code: listing.code, title: listing.title },
      agent: userRef(item.agentId, names),
      statusChangedAt: item.statusChangedAt,
      daysInStage: stageTenure([{ changedAt: item.statusChangedAt }], item.createdAt, context.now)
        .days,
      lastNote: item.lastNote,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      can: opportunityActions(
        actor,
        { stageId: item.stageId, status: item.status, ownership },
        context.catalog,
      ),
    };
  });
}
