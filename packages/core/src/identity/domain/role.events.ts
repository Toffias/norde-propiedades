import type { DomainEvent } from '../../shared/domain/domain-event';

interface RolePayload {
  readonly roleId: string;
}

export type RoleCreated = DomainEvent<'identity.role_created', RolePayload>;
export type RolePermissionsChanged = DomainEvent<'identity.role_permissions_changed', RolePayload>;
export type RoleDeleted = DomainEvent<'identity.role_deleted', RolePayload>;
export type RoleRestored = DomainEvent<'identity.role_restored', RolePayload>;

export type RoleEvent = RoleCreated | RolePermissionsChanged | RoleDeleted | RoleRestored;
