// Fakes del módulo clients para tests (`@norde/core/clients/testing`).

import type { Email, Phone } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  ClientsTransaction,
  ClientsUnitOfWork,
} from '../application/ports/clients-transaction';
import type { OpportunityNotification, TeamNotifier } from '../application/ports/team-notifier';
import { Client, type ClientId } from '../domain/client';
import type { ClientRepository, OpportunityRepository } from '../domain/client.repository';
import { Opportunity, type OpportunityId } from '../domain/opportunity';

/** Guarda snapshots (no instancias), igual que una base: cada lectura devuelve un aggregate nuevo. */
export class InMemoryClientRepository implements ClientRepository {
  readonly rows = new Map<string, ReturnType<Client['toSnapshot']>>();

  findById(id: ClientId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Client.restore(row));
  }

  findByPhone(phone: Phone) {
    const row = [...this.rows.values()].find((r) => r.phone?.sameContactAs(phone));
    return Promise.resolve(row && Client.restore(row));
  }

  findByEmail(email: Email) {
    const row = [...this.rows.values()].find((r) => r.email?.equals(email));
    return Promise.resolve(row && Client.restore(row));
  }

  save(client: Client) {
    this.rows.set(client.id, client.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryOpportunityRepository implements OpportunityRepository {
  readonly rows = new Map<string, ReturnType<Opportunity['toSnapshot']>>();

  findById(id: OpportunityId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Opportunity.restore(row));
  }

  findOpenByClient(clientId: ClientId) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.clientId === clientId)
        .map((r) => Opportunity.restore(r))
        .filter((o) => o.isOpen()),
    );
  }

  save(opportunity: Opportunity) {
    this.rows.set(opportunity.id, opportunity.toSnapshot());
    return Promise.resolve();
  }
}

/**
 * Unidad de trabajo en memoria. Si el trabajo devuelve un `Err` o lanza, descarta lo escrito
 * (como el rollback de la implementación real).
 */
export class InMemoryClientsUnitOfWork implements ClientsUnitOfWork {
  readonly clients = new InMemoryClientRepository();
  readonly opportunities = new InMemoryOpportunityRepository();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: ClientsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      clients: new Map(this.clients.rows),
      opportunities: new Map(this.opportunities.rows),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const rollback = () => {
      this.clients.rows.clear();
      for (const [k, v] of backup.clients) this.clients.rows.set(k, v);
      this.opportunities.rows.clear();
      for (const [k, v] of backup.opportunities) this.opportunities.rows.set(k, v);
      this.events.published.splice(backup.events);
      this.audit.entries.splice(backup.audit);
    };

    try {
      const result = await work(this);
      if (isErrResult(result)) rollback();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

export class RecordingTeamNotifier implements TeamNotifier {
  readonly notifications: OpportunityNotification[] = [];

  notifyOpportunity(notification: OpportunityNotification) {
    this.notifications.push(notification);
    return Promise.resolve();
  }
}
