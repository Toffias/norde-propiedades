import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { ClientId } from './client';
import type { ContactChannel } from './contact-channel';
import type { OpportunityEvent } from './opportunity.events';
import {
  closingStatusFor,
  type CloseReasonRef,
  type OpportunityCloseReasonId,
} from './opportunity-close-reason';
import type { OpportunityStageId, StageRef } from './opportunity-stage';
import {
  checkTransition,
  isOpenStatus,
  type InvalidStatusTransitionError,
  type OpportunityStatus,
} from './opportunity-status';

export type OpportunityId = Id<'Opportunity'>;
export type OpportunityStatusChangeId = Id<'OpportunityStatusChange'>;

/** Catalogación del diagrama: qué busca el cliente. */
export const OPPORTUNITY_TYPES = ['sale', 'rent', 'appraisal'] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** Qué pidió en concreto. Ordenadas de menor a mayor compromiso. */
export const OPPORTUNITY_INTENTS = ['info', 'contact', 'visit'] as const;
export type OpportunityIntent = (typeof OPPORTUNITY_INTENTS)[number];

/** Búsqueda del cliente, guardada para seguimiento y para cruzarla con el stock. */
export interface OpportunitySearch {
  readonly operation?: string | undefined;
  readonly propertyType?: string | undefined;
  readonly location?: string | undefined;
  readonly currency?: string | undefined;
  readonly minPriceCents?: bigint | undefined;
  readonly maxPriceCents?: bigint | undefined;
  readonly minRooms?: number | undefined;
  readonly maxRooms?: number | undefined;
  readonly minBedrooms?: number | undefined;
  readonly amenities?: readonly string[] | undefined;
}

export interface OpportunityNote {
  readonly text: string;
  readonly createdAt: Date;
}

/** Un cambio de estado del historial: de él sale la vigencia. */
export interface OpportunityStatusChange {
  readonly id: OpportunityStatusChangeId;
  /** Sin origen: el estado con el que nació. */
  readonly fromStageId: OpportunityStageId | undefined;
  readonly fromStatus: OpportunityStatus | undefined;
  readonly toStageId: OpportunityStageId;
  readonly toStatus: OpportunityStatus;
  readonly changedAt: Date;
  /** El evento que lo disparó, si fue una regla automática: no se aplica dos veces. */
  readonly sourceEventId: string | undefined;
}

/** Agente responsable y su sucursal (IDs del módulo identity). */
export interface OpportunityAgent {
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
}

/** Qué pasó con una oportunidad derivada a una inmobiliaria socia. */
export const REFERRAL_RESULTS = ['referred', 'no_options', 'returned'] as const;
export type ReferralResult = (typeof REFERRAL_RESULTS)[number];

/** La derivación a una socia: a quién, cuándo y cómo terminó. */
export interface OpportunityReferral {
  readonly partnerName: string | undefined;
  readonly referredAt: Date | undefined;
  readonly result: ReferralResult | undefined;
}

export const NO_REFERRAL: OpportunityReferral = {
  partnerName: undefined,
  referredAt: undefined,
  result: undefined,
};

/** Los datos de la derivación solo se cargan mientras está en "Aplica a otra inmobiliaria". */
export interface OpportunityNotReferredError {
  readonly type: 'OpportunityNotReferred';
}

export interface OpportunityClosedError {
  readonly type: 'OpportunityClosed';
}

export interface StageInactiveError {
  readonly type: 'StageInactive';
}

/** A ganada o perdida solo se llega cerrando, con un motivo. */
export interface CloseRequiresReasonError {
  readonly type: 'CloseRequiresReason';
}

export interface CloseReasonInactiveError {
  readonly type: 'CloseReasonInactive';
}

/** El estado elegido para cerrar no es de la categoría que corresponde al motivo. */
export interface CloseStageMismatchError {
  readonly type: 'CloseStageMismatch';
}

export type MoveToStageError =
  | InvalidStatusTransitionError
  | OpportunityClosedError
  | StageInactiveError
  | CloseRequiresReasonError;

export type CloseOpportunityError =
  | InvalidStatusTransitionError
  | OpportunityClosedError
  | StageInactiveError
  | CloseReasonInactiveError
  | CloseStageMismatchError;

export interface OpportunitySnapshot {
  readonly id: OpportunityId;
  readonly clientId: ClientId;
  readonly originChannel: ContactChannel;
  readonly type: OpportunityType;
  readonly intent: OpportunityIntent;
  /** Categoría del estado (ADR 0013): las reglas y los reportes usan esto. */
  readonly status: OpportunityStatus;
  /** El estado editable. Sin estado, solo las anteriores al backfill. */
  readonly stageId: OpportunityStageId | undefined;
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
  readonly statusChangedAt: Date;
  readonly closedAt: Date | undefined;
  readonly closeReasonId: OpportunityCloseReasonId | undefined;
  readonly referral: OpportunityReferral;
  readonly propertyId: string | undefined;
  readonly search: OpportunitySearch | undefined;
  readonly notes: readonly OpportunityNote[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const MAX_NOTE_LENGTH = 2000;

function note(text: string | undefined, now: Date): OpportunityNote[] {
  const trimmed = text?.trim().slice(0, MAX_NOTE_LENGTH);
  return trimmed ? [{ text: trimmed, createdAt: now }] : [];
}

function strongestIntent(a: OpportunityIntent, b: OpportunityIntent): OpportunityIntent {
  return OPPORTUNITY_INTENTS.indexOf(a) >= OPPORTUNITY_INTENTS.indexOf(b) ? a : b;
}

/** Un cambio de estado: su ID en el historial, cuándo y, si lo disparó una regla, qué evento. */
export interface StageChange {
  readonly id: OpportunityStatusChangeId;
  readonly now: Date;
  readonly sourceEventId?: string | undefined;
}

/** Cada consulta o interés concreto de un cliente. Un cliente puede tener varias. */
export class Opportunity extends AggregateRoot<OpportunityId, OpportunityEvent> {
  #state: Omit<OpportunitySnapshot, 'id'>;
  readonly #changes: OpportunityStatusChange[] = [];

  private constructor(id: OpportunityId, state: Omit<OpportunitySnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static open(input: {
    readonly id: OpportunityId;
    readonly clientId: ClientId;
    readonly originChannel: ContactChannel;
    readonly type: OpportunityType;
    readonly intent: OpportunityIntent;
    /** Lo resuelve `initialStage`: el de la regla "al crear", o derivada si no hay stock. */
    readonly stage: StageRef;
    /** Hereda el agente y la sucursal del contacto. */
    readonly agent: OpportunityAgent;
    readonly statusChangeId: OpportunityStatusChangeId;
    readonly propertyId?: string | undefined;
    readonly search?: OpportunitySearch | undefined;
    readonly note?: string | undefined;
    readonly now: Date;
  }): Opportunity {
    const opportunity = new Opportunity(input.id, {
      clientId: input.clientId,
      originChannel: input.originChannel,
      type: input.type,
      intent: input.intent,
      status: input.stage.category,
      stageId: input.stage.id,
      agentId: input.agent.agentId,
      branchId: input.agent.branchId,
      statusChangedAt: input.now,
      closedAt: undefined,
      closeReasonId: undefined,
      referral: NO_REFERRAL,
      propertyId: input.propertyId,
      search: input.search,
      notes: note(input.note, input.now),
      createdAt: input.now,
      updatedAt: input.now,
    });
    opportunity.#changes.push({
      id: input.statusChangeId,
      fromStageId: undefined,
      fromStatus: undefined,
      toStageId: input.stage.id,
      toStatus: input.stage.category,
      changedAt: input.now,
      sourceEventId: undefined,
    });
    opportunity.record({
      type: 'clients.opportunity_created',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { opportunityId: input.id, clientId: input.clientId },
    });
    return opportunity;
  }

  static restore(snapshot: OpportunitySnapshot): Opportunity {
    const { id, ...state } = snapshot;
    return new Opportunity(id, state);
  }

  get clientId(): ClientId {
    return this.#state.clientId;
  }

  get type(): OpportunityType {
    return this.#state.type;
  }

  get intent(): OpportunityIntent {
    return this.#state.intent;
  }

  get status(): OpportunityStatus {
    return this.#state.status;
  }

  get stageId(): OpportunityStageId | undefined {
    return this.#state.stageId;
  }

  get propertyId(): string | undefined {
    return this.#state.propertyId;
  }

  get referral(): OpportunityReferral {
    return this.#state.referral;
  }

  /** Para las reglas de pertenencia de identity. */
  get ownership(): {
    readonly ownerId: string | undefined;
    readonly ownerBranchId: string | undefined;
  } {
    return { ownerId: this.#state.agentId, ownerBranchId: this.#state.branchId };
  }

  get notes(): readonly OpportunityNote[] {
    return this.#state.notes;
  }

  isOpen(): boolean {
    return isOpenStatus(this.#state.status);
  }

  /** Misma consulta: mismo tipo y misma propiedad (o ninguna). */
  isAbout(query: { readonly type: OpportunityType; readonly propertyId?: string | undefined }) {
    return this.#state.type === query.type && this.#state.propertyId === query.propertyId;
  }

  /**
   * El cliente volvió a consultar por lo mismo: se suma a esta oportunidad en lugar de abrir
   * otra. La intención solo sube (quien pidió visitar no vuelve a "solo info").
   */
  addRequest(input: {
    readonly intent: OpportunityIntent;
    readonly note?: string | undefined;
    readonly search?: OpportunitySearch | undefined;
    readonly now: Date;
  }): void {
    this.#state = {
      ...this.#state,
      intent: strongestIntent(this.#state.intent, input.intent),
      search: input.search ?? this.#state.search,
      notes: [...this.#state.notes, ...note(input.note, input.now)],
      updatedAt: input.now,
    };
    this.record({
      type: 'clients.opportunity_request_added',
      aggregateId: this.id,
      occurredAt: input.now,
      payload: { opportunityId: this.id, clientId: this.#state.clientId },
    });
  }

  /**
   * Pasa a otro estado abierto. Entre estados de la misma categoría siempre se puede; entre
   * categorías, solo por las transiciones del dominio. A ganada o perdida se llega con `close`.
   * Devuelve si cambió.
   */
  moveToStage(stage: StageRef, change: StageChange): Result<boolean, MoveToStageError> {
    if (!this.isOpen()) return err({ type: 'OpportunityClosed' });
    if (stage.id === this.#state.stageId) return ok(false);
    if (!stage.isActive) return err({ type: 'StageInactive' });
    if (!isOpenStatus(stage.category)) return err({ type: 'CloseRequiresReason' });
    if (stage.category !== this.#state.status) {
      const check = checkTransition(this.#state.status, stage.category);
      if (check.isErr()) return err(check.error);
    }
    this.#applyStage(stage, change, undefined);
    return ok(true);
  }

  /**
   * Cierra con un motivo: su calificación decide si queda ganada o perdida, y `stage` tiene que
   * ser de esa categoría. Ganada y perdida son finales.
   */
  close(
    reason: CloseReasonRef,
    stage: StageRef,
    change: StageChange,
  ): Result<void, CloseOpportunityError> {
    if (!this.isOpen()) return err({ type: 'OpportunityClosed' });
    if (!reason.isActive) return err({ type: 'CloseReasonInactive' });
    if (stage.category !== closingStatusFor(reason.rating)) {
      return err({ type: 'CloseStageMismatch' });
    }
    if (!stage.isActive) return err({ type: 'StageInactive' });
    const check = checkTransition(this.#state.status, stage.category);
    if (check.isErr()) return err(check.error);
    this.#applyStage(stage, change, reason.id);
    return ok(undefined);
  }

  #applyStage(
    stage: StageRef,
    change: StageChange,
    closeReasonId: OpportunityCloseReasonId | undefined,
  ): void {
    const from = { stageId: this.#state.stageId, status: this.#state.status };
    const closing = closeReasonId !== undefined;
    this.#state = {
      ...this.#state,
      stageId: stage.id,
      status: stage.category,
      statusChangedAt: change.now,
      closedAt: closing ? change.now : this.#state.closedAt,
      closeReasonId: closing ? closeReasonId : this.#state.closeReasonId,
      updatedAt: change.now,
    };
    this.#changes.push({
      id: change.id,
      fromStageId: from.stageId,
      fromStatus: from.status,
      toStageId: stage.id,
      toStatus: stage.category,
      changedAt: change.now,
      sourceEventId: change.sourceEventId,
    });
    this.record({
      type: 'clients.opportunity_status_changed',
      aggregateId: this.id,
      occurredAt: change.now,
      payload: {
        opportunityId: this.id,
        clientId: this.#state.clientId,
        from: from.status,
        to: stage.category,
        fromStageId: from.stageId,
        toStageId: stage.id,
        closeReasonId,
      },
    });
  }

  /**
   * Pasa a otro agente (o a ninguno) y a su sucursal. Una cerrada no se reasigna. Devuelve si
   * cambió.
   */
  assignAgent(agent: OpportunityAgent, now: Date): Result<boolean, OpportunityClosedError> {
    if (!this.isOpen()) return err({ type: 'OpportunityClosed' });
    const from = this.#state.agentId;
    if (from === agent.agentId && this.#state.branchId === agent.branchId) return ok(false);
    this.#state = {
      ...this.#state,
      agentId: agent.agentId,
      branchId: agent.branchId,
      updatedAt: now,
    };
    this.record({
      type: 'clients.opportunity_reassigned',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        opportunityId: this.id,
        clientId: this.#state.clientId,
        fromAgentId: from,
        toAgentId: agent.agentId,
      },
    });
    return ok(true);
  }

  /**
   * Carga a qué socia se derivó, cuándo y cómo terminó. Solo mientras está en "Aplica a otra
   * inmobiliaria". Devuelve si cambió.
   */
  updateReferral(
    referral: OpportunityReferral,
    now: Date,
  ): Result<boolean, OpportunityNotReferredError> {
    if (this.#state.status !== 'referred_to_partner')
      return err({ type: 'OpportunityNotReferred' });
    const trimmed = referral.partnerName?.trim();
    const partnerName = trimmed === '' ? undefined : trimmed;
    const next = { ...referral, partnerName };
    const current = this.#state.referral;
    if (
      current.partnerName === next.partnerName &&
      current.referredAt?.getTime() === next.referredAt?.getTime() &&
      current.result === next.result
    ) {
      return ok(false);
    }
    this.#state = { ...this.#state, referral: next, updatedAt: now };
    return ok(true);
  }

  /** Los cambios de estado que todavía no se guardaron en el historial. */
  pullStatusChanges(): readonly OpportunityStatusChange[] {
    return this.#changes.splice(0, this.#changes.length);
  }

  toSnapshot(): OpportunitySnapshot {
    return { id: this.id, ...this.#state };
  }
}

/** La oportunidad abierta que corresponde a una nueva consulta del cliente, si existe. */
export function findOpenOpportunityAbout(
  opportunities: readonly Opportunity[],
  query: { readonly type: OpportunityType; readonly propertyId?: string | undefined },
): Opportunity | undefined {
  return opportunities.find((o) => o.isOpen() && o.isAbout(query));
}

/** La abierta más reciente del cliente (la que muestra su ficha), si tiene alguna. */
export function latestOpenOpportunity(
  opportunities: readonly Opportunity[],
): Opportunity | undefined {
  return opportunities
    .filter((o) => o.isOpen())
    .reduce<Opportunity | undefined>((latest, o) => {
      if (latest === undefined) return o;
      const a = o.toSnapshot().createdAt.getTime();
      const b = latest.toSnapshot().createdAt.getTime();
      return a > b || (a === b && o.id > latest.id) ? o : latest;
    }, undefined);
}
