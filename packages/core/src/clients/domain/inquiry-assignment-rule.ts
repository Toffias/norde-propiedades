import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { ContactChannel } from './contact-channel';
import { normalizeName } from './duplicate-check';
import type { InquirySnapshot } from './inquiry';
import {
  MAX_AGENT_WEIGHT,
  MIN_AGENT_WEIGHT,
  pickWeighted,
  type WeightedAgent,
} from '../../shared/domain/weighted-distribution';

export type InquiryRuleId = Id<'InquiryAssignmentRule'>;

/** Tope de reglas: se evalúan todas las activas con cada consulta, en orden. */
export const MAX_INQUIRY_RULES = 100;
export const MAX_RULE_AGENTS = 20;
/** Tope de valores por condición (canales, barrios, propiedades…). */
export const MAX_CONDITION_VALUES = 50;
export const MAX_RULE_NAME_LENGTH = 80;

/**
 * Qué consultas toma una regla. Cada lista vacía es "cualquiera"; dentro de una lista alcanza con
 * uno de los valores, y la consulta tiene que cumplir todas las listas que tienen alguno.
 */
export interface InquiryRuleConditions {
  readonly channels: readonly ContactChannel[];
  /** Operaciones de la propiedad consultada (`sale`, `rent`, `temporary_rent`). */
  readonly operations: readonly string[];
  /** Tipos de propiedad (`apartment`, `house`…). */
  readonly propertyTypes: readonly string[];
  /** La zona: barrios de la propiedad consultada, por nombre. */
  readonly neighborhoods: readonly string[];
  readonly propertyIds: readonly string[];
  readonly developmentIds: readonly string[];
}

export const ANY_INQUIRY: InquiryRuleConditions = {
  channels: [],
  operations: [],
  propertyTypes: [],
  neighborhoods: [],
  propertyIds: [],
  developmentIds: [],
};

/** Lo que se compara de una consulta, tomado de sus etiquetas automáticas y sus IDs. */
export interface InquiryRoutingFacts {
  readonly channel: ContactChannel;
  readonly operations: readonly string[];
  readonly propertyType: string | undefined;
  readonly neighborhood: string | undefined;
  readonly propertyId: string | undefined;
  readonly developmentId: string | undefined;
}

export function inquiryRoutingFacts(
  inquiry: Pick<InquirySnapshot, 'channel' | 'autoTags' | 'propertyId' | 'developmentId'>,
): InquiryRoutingFacts {
  const tagged = (kind: string) =>
    inquiry.autoTags
      .filter((tag) => tag.startsWith(`${kind}:`))
      .map((tag) => tag.slice(kind.length + 1));
  return {
    channel: inquiry.channel,
    operations: tagged('operation'),
    propertyType: tagged('type')[0],
    neighborhood: tagged('neighborhood')[0],
    propertyId: inquiry.propertyId,
    developmentId: inquiry.developmentId,
  };
}

export interface InquiryRuleSnapshot {
  readonly id: InquiryRuleId;
  readonly name: string;
  readonly isActive: boolean;
  /** Prioridad: la de menor posición se evalúa primero. */
  readonly position: number;
  readonly conditions: InquiryRuleConditions;
  /** En el orden en que se cargaron: el reparto depende de él. */
  readonly agents: readonly WeightedAgent[];
  /** Cuántas consultas repartió: la próxima es la número `cursor` (ver `pickWeighted`). */
  readonly cursor: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type InvalidInquiryRuleError =
  | { readonly type: 'InvalidInquiryRule'; readonly reason: 'name' }
  | { readonly type: 'InvalidInquiryRule'; readonly reason: 'no_agents' }
  | {
      readonly type: 'InvalidInquiryRule';
      readonly reason: 'too_many_agents';
      readonly max: number;
    }
  | { readonly type: 'InvalidInquiryRule'; readonly reason: 'duplicate_agent' }
  | {
      readonly type: 'InvalidInquiryRule';
      readonly reason: 'weight';
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly type: 'InvalidInquiryRule';
      readonly reason: 'too_many_values';
      readonly max: number;
    };

export interface TooManyInquiryRulesError {
  readonly type: 'TooManyInquiryRules';
  readonly max: number;
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Sin repetidos ni vacíos, en el orden en que vinieron. */
function uniqueValues<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].filter((value) => value !== '');
}

function cleanConditions(
  conditions: InquiryRuleConditions,
): Result<InquiryRuleConditions, InvalidInquiryRuleError> {
  const clean: InquiryRuleConditions = {
    channels: uniqueValues(conditions.channels),
    operations: uniqueValues(conditions.operations),
    propertyTypes: uniqueValues(conditions.propertyTypes),
    neighborhoods: uniqueValues(conditions.neighborhoods.map(cleanName)),
    propertyIds: uniqueValues(conditions.propertyIds.map((id) => id.toLowerCase())),
    developmentIds: uniqueValues(conditions.developmentIds.map((id) => id.toLowerCase())),
  };
  const tooMany = Object.values(clean).some(
    (values: readonly string[]) => values.length > MAX_CONDITION_VALUES,
  );
  if (tooMany) {
    return err({
      type: 'InvalidInquiryRule',
      reason: 'too_many_values',
      max: MAX_CONDITION_VALUES,
    });
  }
  return ok(clean);
}

function checkAgents(
  agents: readonly WeightedAgent[],
): Result<readonly WeightedAgent[], InvalidInquiryRuleError> {
  if (agents.length === 0) return err({ type: 'InvalidInquiryRule', reason: 'no_agents' });
  if (agents.length > MAX_RULE_AGENTS) {
    return err({ type: 'InvalidInquiryRule', reason: 'too_many_agents', max: MAX_RULE_AGENTS });
  }
  if (new Set(agents.map((a) => a.userId)).size !== agents.length) {
    return err({ type: 'InvalidInquiryRule', reason: 'duplicate_agent' });
  }
  const badWeight = agents.some(
    (a) =>
      !Number.isInteger(a.weight) || a.weight < MIN_AGENT_WEIGHT || a.weight > MAX_AGENT_WEIGHT,
  );
  if (badWeight) {
    return err({
      type: 'InvalidInquiryRule',
      reason: 'weight',
      min: MIN_AGENT_WEIGHT,
      max: MAX_AGENT_WEIGHT,
    });
  }
  return ok(agents.map((a) => ({ userId: a.userId, weight: a.weight })));
}

function within(values: readonly string[], value: string | undefined): boolean {
  return values.length === 0 || (value !== undefined && values.includes(value));
}

/**
 * Una regla de asignación automática de consultas: qué consultas toma (condiciones) y entre qué
 * agentes las reparte, con su peso. Las activas se evalúan por prioridad; gana la primera que
 * coincide.
 */
export class InquiryAssignmentRule extends AggregateRoot<InquiryRuleId, never> {
  #state: Omit<InquiryRuleSnapshot, 'id'>;

  private constructor(id: InquiryRuleId, state: Omit<InquiryRuleSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  /** Nace activa y última en la prioridad. */
  static create(input: {
    readonly id: InquiryRuleId;
    readonly name: string;
    readonly conditions: InquiryRuleConditions;
    readonly agents: readonly WeightedAgent[];
    readonly existingCount: number;
    /** La posición siguiente a la última (las posiciones no son consecutivas tras un borrado). */
    readonly nextPosition: number;
    readonly now: Date;
  }): Result<InquiryAssignmentRule, InvalidInquiryRuleError | TooManyInquiryRulesError> {
    if (input.existingCount >= MAX_INQUIRY_RULES) {
      return err({ type: 'TooManyInquiryRules', max: MAX_INQUIRY_RULES });
    }
    const name = cleanName(input.name);
    if (name === '' || name.length > MAX_RULE_NAME_LENGTH) {
      return err({ type: 'InvalidInquiryRule', reason: 'name' });
    }
    const conditions = cleanConditions(input.conditions);
    if (conditions.isErr()) return err(conditions.error);
    const agents = checkAgents(input.agents);
    if (agents.isErr()) return err(agents.error);
    return ok(
      new InquiryAssignmentRule(input.id, {
        name,
        isActive: true,
        position: input.nextPosition,
        conditions: conditions.value,
        agents: agents.value,
        cursor: 0n,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(snapshot: InquiryRuleSnapshot): InquiryAssignmentRule {
    const { id, ...state } = snapshot;
    return new InquiryAssignmentRule(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get isActive(): boolean {
    return this.#state.isActive;
  }

  get position(): number {
    return this.#state.position;
  }

  /**
   * Cambia el nombre, las condiciones y los agentes. Si cambian los agentes o sus pesos, el reparto
   * arranca de cero: el cursor de la secuencia anterior no significa nada en la nueva.
   */
  edit(
    input: {
      readonly name: string;
      readonly conditions: InquiryRuleConditions;
      readonly agents: readonly WeightedAgent[];
    },
    now: Date,
  ): Result<boolean, InvalidInquiryRuleError> {
    const name = cleanName(input.name);
    if (name === '' || name.length > MAX_RULE_NAME_LENGTH) {
      return err({ type: 'InvalidInquiryRule', reason: 'name' });
    }
    const conditions = cleanConditions(input.conditions);
    if (conditions.isErr()) return err(conditions.error);
    const agents = checkAgents(input.agents);
    if (agents.isErr()) return err(agents.error);

    const sameAgents = JSON.stringify(agents.value) === JSON.stringify(this.#state.agents);
    const sameConditions =
      JSON.stringify(conditions.value) === JSON.stringify(this.#state.conditions);
    if (name === this.#state.name && sameAgents && sameConditions) return ok(false);
    this.#state = {
      ...this.#state,
      name,
      conditions: conditions.value,
      agents: agents.value,
      cursor: sameAgents ? this.#state.cursor : 0n,
      updatedAt: now,
    };
    return ok(true);
  }

  /** Activa o inactiva. Devuelve si cambió. */
  setActive(active: boolean, now: Date): boolean {
    if (active === this.#state.isActive) return false;
    this.#state = { ...this.#state, isActive: active, updatedAt: now };
    return true;
  }

  moveTo(position: number, now: Date): boolean {
    if (position === this.#state.position) return false;
    this.#state = { ...this.#state, position, updatedAt: now };
    return true;
  }

  /** ¿Toma esta consulta? Una inactiva no toma ninguna. */
  matches(facts: InquiryRoutingFacts): boolean {
    if (!this.#state.isActive) return false;
    const c = this.#state.conditions;
    const neighborhood =
      facts.neighborhood === undefined ? undefined : normalizeName(facts.neighborhood);
    return (
      within(c.channels, facts.channel) &&
      (c.operations.length === 0 || facts.operations.some((op) => c.operations.includes(op))) &&
      within(c.propertyTypes, facts.propertyType) &&
      within(c.neighborhoods.map(normalizeName), neighborhood) &&
      within(c.propertyIds, facts.propertyId?.toLowerCase()) &&
      within(c.developmentIds, facts.developmentId?.toLowerCase())
    );
  }

  /**
   * El agente que recibe la próxima consulta, entre los de la regla que siguen activos, y avanza el
   * reparto. Sin ninguno activo devuelve `undefined` y no avanza.
   */
  assignNext(activeUserIds: ReadonlySet<string>, now: Date): string | undefined {
    const eligible = this.#state.agents.filter((a) => activeUserIds.has(a.userId));
    const picked = pickWeighted(eligible, this.#state.cursor);
    if (!picked) return undefined;
    this.#state = { ...this.#state, cursor: this.#state.cursor + 1n, updatedAt: now };
    return picked.userId;
  }

  toSnapshot(): InquiryRuleSnapshot {
    return {
      id: this.id,
      ...this.#state,
      conditions: cleanConditionsCopy(this.#state.conditions),
      agents: this.#state.agents.map((a) => ({ ...a })),
    };
  }
}

function cleanConditionsCopy(c: InquiryRuleConditions): InquiryRuleConditions {
  return {
    channels: [...c.channels],
    operations: [...c.operations],
    propertyTypes: [...c.propertyTypes],
    neighborhoods: [...c.neighborhoods],
    propertyIds: [...c.propertyIds],
    developmentIds: [...c.developmentIds],
  };
}

/** Por prioridad; entre dos con la misma posición, por ID (creadas a la vez). */
export function byPriority(a: InquiryAssignmentRule, b: InquiryAssignmentRule): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}

/** La primera regla activa, por prioridad, que toma la consulta. */
export function findRuleFor(
  rules: readonly InquiryAssignmentRule[],
  facts: InquiryRoutingFacts,
): InquiryAssignmentRule | undefined {
  return [...rules].sort(byPriority).find((rule) => rule.matches(facts));
}
