import type { DomainEvent } from '../../shared/domain/domain-event';

interface BranchPayload {
  readonly branchId: string;
}

export type BranchCreated = DomainEvent<'identity.branch_created', BranchPayload>;
export type BranchMadeMain = DomainEvent<'identity.branch_made_main', BranchPayload>;
export type BranchDeleted = DomainEvent<'identity.branch_deleted', BranchPayload>;
export type BranchRestored = DomainEvent<'identity.branch_restored', BranchPayload>;

export type BranchEvent = BranchCreated | BranchMadeMain | BranchDeleted | BranchRestored;
