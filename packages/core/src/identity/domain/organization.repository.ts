import type { Branch, BranchId } from './branch';
import type { Team, TeamId } from './team';

export interface BranchRepository {
  /** También las que están en la papelera. */
  findById(id: BranchId): Promise<Branch | undefined>;
  /** Una vigente con el mismo nombre, sin distinguir mayúsculas ni acentos. */
  findActiveByName(name: string): Promise<Branch | undefined>;
  findMain(): Promise<Branch | undefined>;
  /** De los IDs pedidos, los de sucursales vigentes. */
  findExistingIds(ids: readonly string[]): Promise<readonly string[]>;
  countUsers(id: BranchId): Promise<number>;
  countTeams(id: BranchId): Promise<number>;
  save(branch: Branch, actorId: string): Promise<void>;
}

export interface TeamRepository {
  findById(id: TeamId): Promise<Team | undefined>;
  /** Uno vigente con el mismo nombre, sin distinguir mayúsculas ni acentos. */
  findActiveByName(name: string): Promise<Team | undefined>;
  save(team: Team, actorId: string): Promise<void>;
  isMember(teamId: TeamId, userId: string): Promise<boolean>;
  addMember(teamId: TeamId, userId: string, actorId: string, now: Date): Promise<void>;
  removeMember(teamId: TeamId, userId: string): Promise<void>;
}
