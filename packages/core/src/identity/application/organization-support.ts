import {
  Email,
  err,
  ok,
  parseId,
  Phone,
  type AuditState,
  type AuditTarget,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../shared';
import type { Branch, BranchContact } from '../domain/branch';
import type { BranchRepository, TeamRepository } from '../domain/organization.repository';
import type { Team } from '../domain/team';

// Lo que comparten los casos de uso de sucursales y equipos: auditoría, búsqueda por ID y la
// conversión de los datos de contacto a value objects.

export function branchAuditState(branch: Branch): AuditState {
  const { name, logoUrl, address, email, phone, whatsapp, isMain } = branch.toSnapshot();
  return {
    name,
    logoUrl,
    address,
    email: email?.value,
    phone: phone?.e164,
    whatsapp: whatsapp?.e164,
    isMain,
  };
}

export function teamAuditState(team: Team): AuditState {
  const { name, branchId } = team.toSnapshot();
  return { name, branchId };
}

export function branchTarget(action: string, branchId: string): AuditTarget {
  return { action, entityType: 'branch', entityId: branchId, clientIds: [] };
}

export function teamTarget(action: string, teamId: string): AuditTarget {
  return { action, entityType: 'team', entityId: teamId, clientIds: [] };
}

export async function findBranch(branches: BranchRepository, rawId: string) {
  const id = parseId<'Branch'>(rawId);
  return id.isOk() ? branches.findById(id.value) : undefined;
}

export async function findTeam(teams: TeamRepository, rawId: string) {
  const id = parseId<'Team'>(rawId);
  return id.isOk() ? teams.findById(id.value) : undefined;
}

/** Valida un dato opcional: sin valor, `undefined`; con valor, el value object o su error. */
function optional<T, E>(
  raw: string | undefined,
  create: (value: string) => Result<T, E>,
): Result<T | undefined, E> {
  return raw === undefined ? ok(undefined) : create(raw);
}

/** Los datos de contacto que llegan del formulario, validados como `Email` y `Phone`. */
export function branchContact(data: {
  readonly name: string;
  readonly logoUrl?: string | undefined;
  readonly address?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly whatsapp?: string | undefined;
}): Result<BranchContact, InvalidEmailError | InvalidPhoneError> {
  const email = optional(data.email, (value) => Email.create(value));
  if (email.isErr()) return err(email.error);
  const phone = optional(data.phone, (value) => Phone.create(value));
  if (phone.isErr()) return err(phone.error);
  const whatsapp = optional(data.whatsapp, (value) => Phone.create(value));
  if (whatsapp.isErr()) return err(whatsapp.error);

  return ok({
    name: data.name,
    logoUrl: data.logoUrl,
    address: data.address,
    email: email.value,
    phone: phone.value,
    whatsapp: whatsapp.value,
  });
}
