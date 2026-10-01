import { err, ok, type Result } from '../../shared/domain/result';

/**
 * Alcances de una numeración, de más específico a menos. Cuando aplican varios, gana el primero:
 * el prefijo exclusivo del usuario, después el de su equipo, el de su sucursal, el del tipo de
 * propiedad y, por último, el global.
 */
export const REFERENCE_CODE_SCOPES = ['user', 'team', 'branch', 'property_type', 'global'] as const;
export type ReferenceCodeScope = (typeof REFERENCE_CODE_SCOPES)[number];

/** Una numeración se identifica por su alcance y el valor del alcance (ID o tipo de propiedad). */
export interface ReferenceCodeScopeKey {
  readonly scope: ReferenceCodeScope;
  /** `''` para `global`. */
  readonly scopeValue: string;
}

export const GLOBAL_SCOPE: ReferenceCodeScopeKey = { scope: 'global', scopeValue: '' };

export const REFERENCE_CODE_DIGITS = 4;
const PREFIX = /^[A-Z0-9]{1,6}$/;
const CODE = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

export interface InvalidReferenceCodePrefixError {
  readonly type: 'InvalidReferenceCodePrefix';
}

export interface InvalidReferenceCodeError {
  readonly type: 'InvalidReferenceCode';
}

/** Prefijo de una numeración (`CAS`, `P`): de 1 a 6 letras o números, en mayúsculas. */
export class ReferenceCodePrefix {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ReferenceCodePrefix, InvalidReferenceCodePrefixError> {
    const value = raw.trim().toUpperCase();
    if (!PREFIX.test(value)) return err({ type: 'InvalidReferenceCodePrefix' });
    return ok(new ReferenceCodePrefix(value));
  }

  equals(other: ReferenceCodePrefix): boolean {
    return this.value === other.value;
  }
}

/**
 * Código de referencia de una propiedad o emprendimiento (`CAS0012`). Lo genera la numeración, o
 * lo carga una persona a mano; en los dos casos es único.
 */
export class ReferenceCode {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ReferenceCode, InvalidReferenceCodeError> {
    const value = raw.trim().toUpperCase();
    if (!CODE.test(value)) return err({ type: 'InvalidReferenceCode' });
    return ok(new ReferenceCode(value));
  }

  /** El prefijo seguido del número, con ceros a la izquierda hasta 4 dígitos (`CAS0012`). */
  static format(prefix: ReferenceCodePrefix, number: bigint): ReferenceCode {
    return new ReferenceCode(
      `${prefix.value}${number.toString().padStart(REFERENCE_CODE_DIGITS, '0')}`,
    );
  }
}

/** Quién da de alta y qué: con esto se elige la numeración. */
export interface ReferenceCodeContext {
  readonly userId?: string | undefined;
  /** Equipos del usuario, en orden de preferencia. */
  readonly teamIds?: readonly string[] | undefined;
  readonly branchId?: string | undefined;
  readonly propertyType?: string | undefined;
}

/** Numeraciones candidatas para un alta, de la que más gana a la que menos. Siempre termina en la global. */
export function referenceCodeCandidates(context: ReferenceCodeContext): ReferenceCodeScopeKey[] {
  const candidates: ReferenceCodeScopeKey[] = [];
  if (context.userId !== undefined) candidates.push({ scope: 'user', scopeValue: context.userId });
  for (const teamId of context.teamIds ?? []) {
    candidates.push({ scope: 'team', scopeValue: teamId });
  }
  if (context.branchId !== undefined) {
    candidates.push({ scope: 'branch', scopeValue: context.branchId });
  }
  if (context.propertyType !== undefined) {
    candidates.push({ scope: 'property_type', scopeValue: context.propertyType });
  }
  candidates.push(GLOBAL_SCOPE);
  return candidates;
}

/** De las numeraciones configuradas, la que corresponde al alta (la primera candidata que existe). */
export function resolveReferenceCodeScope<T extends ReferenceCodeScopeKey>(
  context: ReferenceCodeContext,
  configured: readonly T[],
): T | undefined {
  for (const candidate of referenceCodeCandidates(context)) {
    const match = configured.find(
      (sequence) =>
        sequence.scope === candidate.scope && sequence.scopeValue === candidate.scopeValue,
    );
    if (match) return match;
  }
  return undefined;
}
