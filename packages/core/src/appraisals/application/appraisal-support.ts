import { canActOn, OWNERSHIP_RULES, type OwnershipRule } from '../../identity';
import {
  err,
  ok,
  parseId,
  toAuditValue,
  type Actor,
  type AuditState,
  type AuditTarget,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { CreateAppraisalValues } from '../contracts';
import type { Appraisal, AppraisalDetails } from '../domain/appraisal';
import type { AppraisalRepository } from '../domain/appraisal.repository';
import type { AppraisalsTransaction } from './ports/appraisals-transaction';
import type { ActiveUsers } from './ports/panel-directory';

// Lo que comparten los casos de uso de tasaciones: permisos, auditoría y armado de los datos.

export interface AppraisalNotFoundError {
  readonly type: 'AppraisalNotFound';
}
export interface AppraisalPhotoNotFoundError {
  readonly type: 'AppraisalPhotoNotFound';
}
export interface ProducerNotFoundError {
  readonly type: 'ProducerNotFound';
}
export interface AppraiserNotFoundError {
  readonly type: 'AppraiserNotFound';
}
export interface InvalidInputError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

/** Un `safeParse` fallido, como error esperado. */
export function invalidInput(error: {
  readonly issues: readonly { readonly message: string }[];
}): InvalidInputError {
  return { type: 'InvalidInput', issues: error.issues.map((issue) => issue.message) };
}

/** De quién es una tasación: el productor, el tasador y la sucursal del productor. */
export interface AppraisalOwnership {
  readonly producerUserId: string;
  readonly appraiserUserId: string | undefined;
  readonly branchId: string | undefined;
}

/**
 * ¿Le alcanza la regla sobre esta tasación? Es "suya" si la produce o la tasa; las de otros piden
 * `appraisals:read-others` ("Ver tasaciones de otros").
 */
export function canActOnAppraisal(
  actor: Actor,
  rule: OwnershipRule,
  appraisal: AppraisalOwnership,
): boolean {
  const owners = [appraisal.producerUserId, appraisal.appraiserUserId];
  return owners.some((ownerId) =>
    canActOn(actor, rule, { ownerId, ownerBranchId: appraisal.branchId }),
  );
}

/** Puede ver la tasación y, con `permission`, cambiarla. */
export function canChangeAppraisal(
  actor: Actor,
  permission: 'appraisals:update' | 'appraisals:delete',
  appraisal: AppraisalOwnership,
): boolean {
  return (
    actor.can(permission) && canActOnAppraisal(actor, OWNERSHIP_RULES.appraisalsRead, appraisal)
  );
}

export async function findAppraisal(
  appraisals: AppraisalRepository,
  rawId: string,
): Promise<Appraisal | undefined> {
  const id = parseId<'Appraisal'>(rawId);
  return id.isOk() ? appraisals.findById(id.value) : undefined;
}

/**
 * La tasación, para cambiarla con `permission`. Una que el usuario no ve es, para él, una que no
 * existe: no se distingue de una inexistente.
 */
export async function loadAppraisalForChange(
  tx: AppraisalsTransaction,
  actor: Actor,
  permission: 'appraisals:update' | 'appraisals:delete',
  appraisalId: string,
): Promise<Result<Appraisal, ForbiddenError | AppraisalNotFoundError>> {
  if (!actor.can(permission)) return err({ type: 'Forbidden' });
  const appraisal = await findAppraisal(tx.appraisals, appraisalId);
  if (!appraisal) return err({ type: 'AppraisalNotFound' });
  if (!canChangeAppraisal(actor, permission, appraisal)) return err({ type: 'AppraisalNotFound' });
  return ok(appraisal);
}

/** La tasación, si el usuario la puede ver (también en la papelera). */
export async function loadAppraisalForRead(
  tx: AppraisalsTransaction,
  actor: Actor,
  appraisalId: string,
): Promise<Result<Appraisal, ForbiddenError | AppraisalNotFoundError>> {
  if (!actor.can('appraisals:read')) return err({ type: 'Forbidden' });
  const appraisal = await findAppraisal(tx.appraisals, appraisalId);
  if (!appraisal || !canActOnAppraisal(actor, OWNERSHIP_RULES.appraisalsRead, appraisal)) {
    return err({ type: 'AppraisalNotFound' });
  }
  return ok(appraisal);
}

/** Valores crudos de la tasación para su historial. Usuarios, sucursal y cliente, por ID. */
export function appraisalAuditState(appraisal: Appraisal): AuditState {
  const s = appraisal.toSnapshot();
  return {
    code: s.code,
    source: s.source,
    status: s.status,
    requesterClientId: s.requesterClientId,
    producerUserId: s.producerUserId,
    branchId: s.branchId,
    appraiserUserId: s.appraiserUserId,
    visitAt: s.visitAt,
    propertyType: s.propertyType,
    address: s.address,
    surfaceTotalM2: s.surfaceTotalM2,
    surfaceCoveredM2: s.surfaceCoveredM2,
    rooms: s.rooms,
    bedrooms: s.bedrooms,
    bathrooms: s.bathrooms,
    condition: s.condition,
  };
}

/**
 * Toda entrada lleva al solicitante en `clientIds`, para poder suprimirla. Si cambió, también al
 * anterior (`previousRequester`), que queda en el diff.
 */
export function appraisalTarget(
  action: string,
  appraisal: Appraisal,
  previousRequester?: string,
): AuditTarget {
  const clientIds = new Set([appraisal.requesterClientId]);
  if (previousRequester !== undefined) clientIds.add(previousRequester);
  return { action, entityType: 'appraisal', entityId: appraisal.id, clientIds: [...clientIds] };
}

/** El resultado, para el historial: montos en centavos con su moneda y los comparables como lista. */
export function appraisalResultAuditState(appraisal: Appraisal): AuditState {
  const { sale, rent, comparables, observations } = appraisal.result;
  return {
    saleMinCents: sale?.minCents,
    saleMaxCents: sale?.maxCents,
    saleCurrency: sale?.currency,
    rentMinCents: rent?.minCents,
    rentMaxCents: rent?.maxCents,
    rentCurrency: rent?.currency,
    comparables: comparables.length === 0 ? undefined : comparables.map(toAuditValue),
    observations,
  };
}

/** `AAAA-MM-DDTHH:mm[:ss]` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC. */
export function buenosAiresInstant(local: string): Date {
  return new Date(`${local.length === 16 ? `${local}:00` : local}-03:00`);
}

/**
 * Arma los datos: el productor (con su sucursal) y el tasador tienen que ser usuarios activos. Sin
 * productor, queda quien la carga. Al editar (`current`), los que no cambian no se vuelven a
 * validar y el productor conserva su sucursal.
 */
export async function buildDetails(
  users: ActiveUsers,
  actor: Actor,
  input: CreateAppraisalValues,
  current?: AppraisalDetails,
): Promise<Result<AppraisalDetails, ProducerNotFoundError | AppraiserNotFoundError>> {
  const producerUserId = input.producerUserId ?? current?.producerUserId ?? actor.id;
  let branchId = current?.branchId;
  if (current?.producerUserId !== producerUserId) {
    const producer = await users.find(producerUserId);
    if (!producer) return err({ type: 'ProducerNotFound' });
    branchId = producer.branchId;
  }
  const appraiserUserId = input.appraiserUserId;
  if (appraiserUserId !== undefined && appraiserUserId !== current?.appraiserUserId) {
    if (!(await users.find(appraiserUserId))) return err({ type: 'AppraiserNotFound' });
  }
  return ok({
    requesterClientId: input.requesterClientId,
    producerUserId,
    branchId,
    appraiserUserId,
    visitAt: input.visitAt === undefined ? undefined : buenosAiresInstant(input.visitAt),
    propertyType: input.propertyType,
    address: input.address,
    surfaceTotalM2: input.surfaceTotalM2,
    surfaceCoveredM2: input.surfaceCoveredM2,
    rooms: input.rooms,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    condition: input.condition,
  });
}
