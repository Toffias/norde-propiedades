import type { Client, ClientId } from './client';
import type { ContactKeys } from './duplicate-check';
import type { Opportunity, OpportunityId } from './opportunity';

/** Tope de coincidencias que devuelve una búsqueda de duplicados. */
export const MAX_DUPLICATE_CANDIDATES = 10;

export interface ClientRepository {
  /** Incluye los de la papelera. */
  findById(id: ClientId): Promise<Client | undefined>;
  /**
   * Los clientes que tienen alguno de estos teléfonos (por `Phone.matchKey`: el mismo celular con
   * o sin el 9) o emails, en cualquiera de sus teléfonos y emails. Incluye los de la papelera.
   * Como mucho `MAX_DUPLICATE_CANDIDATES`.
   */
  findMatching(contact: ContactKeys): Promise<Client[]>;
  /** Los activos con este nombre (sin distinguir mayúsculas), como mucho `MAX_DUPLICATE_CANDIDATES`. */
  findByName(name: string): Promise<Client[]>;
  /** `actorId` queda como autor de la fila (`created_by` / `updated_by`). */
  save(client: Client, actorId: string): Promise<void>;
}

export interface OpportunityRepository {
  findById(id: OpportunityId): Promise<Opportunity | undefined>;
  findOpenByClient(clientId: ClientId): Promise<Opportunity[]>;
  save(opportunity: Opportunity): Promise<void>;
}
