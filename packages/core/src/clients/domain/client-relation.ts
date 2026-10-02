import type { ClientKind } from './client-values';

/**
 * Cómo se relaciona un contacto con otro: una persona trabaja en una empresa, una persona o una
 * empresa es miembro de un grupo, y cualquier par puede estar relacionado (con una etiqueta libre:
 * "esposa", "contador").
 */
export const CLIENT_RELATION_KINDS = ['works_at', 'member_of', 'related'] as const;
export type ClientRelationKind = (typeof CLIENT_RELATION_KINDS)[number];

/** Tope de relaciones que un contacto declara: más es un error de carga. */
export const MAX_CLIENT_RELATIONS = 50;

const MAX_LABEL_LENGTH = 60;

/** Una relación que declara el contacto, hacia otro contacto. Se guarda una sola vez. */
export interface ClientRelation {
  readonly relatedClientId: string;
  readonly kind: ClientRelationKind;
  readonly label: string | undefined;
}

export interface SelfRelationError {
  readonly type: 'SelfRelation';
}

/** La relación no tiene sentido entre esos tipos de registro (una empresa no "trabaja en"). */
export interface InvalidRelationError {
  readonly type: 'InvalidRelation';
}

export interface TooManyRelationsError {
  readonly type: 'TooManyRelations';
}

/** ¿Puede un registro de tipo `from` tener esta relación con uno de tipo `to`? */
export function relationAllowed(
  kind: ClientRelationKind,
  from: ClientKind,
  to: ClientKind,
): boolean {
  switch (kind) {
    case 'works_at':
      return from === 'person' && to === 'company';
    case 'member_of':
      return from !== 'group' && to === 'group';
    case 'related':
      return true;
  }
}

export function cleanRelationLabel(label: string | undefined): string | undefined {
  const trimmed = label?.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH);
  return trimmed === '' ? undefined : trimmed;
}

/** Misma relación: hacia el mismo contacto y del mismo tipo (la etiqueta puede cambiar). */
export function sameRelation(
  a: Pick<ClientRelation, 'relatedClientId' | 'kind'>,
  b: Pick<ClientRelation, 'relatedClientId' | 'kind'>,
): boolean {
  return a.relatedClientId === b.relatedClientId && a.kind === b.kind;
}
