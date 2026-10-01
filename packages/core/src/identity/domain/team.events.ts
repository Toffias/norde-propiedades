import type { DomainEvent } from '../../shared/domain/domain-event';

interface TeamPayload {
  readonly teamId: string;
}

export type TeamCreated = DomainEvent<'identity.team_created', TeamPayload>;
export type TeamDeleted = DomainEvent<'identity.team_deleted', TeamPayload>;
export type TeamRestored = DomainEvent<'identity.team_restored', TeamPayload>;

export type TeamEvent = TeamCreated | TeamDeleted | TeamRestored;
