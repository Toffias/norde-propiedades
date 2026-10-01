import type { Actor } from './actor';
import type { AuditChanges, AuditEntry, AuditValue, FieldChange } from './ports';

/** Estado auditable de una entidad: valores crudos por campo. `undefined` se guarda como `null`. */
export type AuditState = Readonly<Record<string, AuditValue | undefined>>;

/** A qué entidad se refiere la entrada y qué clientes aparecen en ella. */
export interface AuditTarget {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly clientIds: readonly string[];
}

/**
 * Convierte un valor del dominio (un objeto de búsqueda, una lista) a un valor auditable: descarta
 * los campos `undefined` y deja los primitivos, las fechas, las listas y los objetos planos.
 */
export function toAuditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    value instanceof Date
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item: unknown) => toAuditValue(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== undefined)
        .map(([key, field]: [string, unknown]) => [key, toAuditValue(field)]),
    );
  }
  // Funciones y símbolos: un error de programación, no un dato.
  throw new TypeError(`Valor no auditable: ${typeof value}`);
}

// `Array.isArray` no angosta las listas `readonly`.
function isList(value: AuditValue): value is readonly AuditValue[] {
  return Array.isArray(value);
}

function sameValue(a: AuditValue, b: AuditValue): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (isList(a) || isList(b)) {
    if (!isList(a) || !isList(b) || a.length !== b.length) return false;
    return a.every((item, i) => {
      const other = b[i];
      return other !== undefined && sameValue(item, other);
    });
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => sameValue(a[key] ?? null, b[key] ?? null));
  }
  return a === b;
}

/** Solo los campos que cambiaron entre dos estados, con `before` y `after`. */
export function diffChanges(before: AuditState, after: AuditState): AuditChanges {
  const changes: Record<string, FieldChange> = {};
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (!sameValue(from, to)) changes[field] = { before: from, after: to };
  }
  return changes;
}

function base(actor: Actor, target: AuditTarget) {
  return {
    actorId: actor.id,
    source: actor.source,
    ...(actor.correlationId === undefined ? {} : { correlationId: actor.correlationId }),
    ...target,
  };
}

/** Alta: los valores iniciales de cada campo con valor (`before: null`); los vacíos no se guardan. */
export function auditCreated(actor: Actor, target: AuditTarget, state: AuditState): AuditEntry {
  return { ...base(actor, target), kind: 'created', changes: diffChanges({}, state) };
}

/**
 * Edición: solo los campos que cambiaron. Devuelve `undefined` si no cambió nada, y entonces
 * no se registra.
 */
export function auditUpdated(
  actor: Actor,
  target: AuditTarget,
  before: AuditState,
  after: AuditState,
): AuditEntry | undefined {
  const changes = diffChanges(before, after);
  if (Object.keys(changes).length === 0) return undefined;
  return { ...base(actor, target), kind: 'updated', changes };
}

/** Acción explícita (baja, restauración, unificación, asignación…), con un diff opcional. */
export function auditAction(actor: Actor, target: AuditTarget, changes?: AuditChanges): AuditEntry {
  if (changes === undefined || Object.keys(changes).length === 0) {
    return { ...base(actor, target), kind: 'action' };
  }
  return { ...base(actor, target), kind: 'action', changes };
}
