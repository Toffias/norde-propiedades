import type { Client, ClientId } from './client';
import type { ClientTag, ClientTagGroup, ClientTagGroupId, ClientTagId } from './client-tag';
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
  /**
   * Los activos cuyo nombre contiene este (sin distinguir mayúsculas ni acentos), como mucho
   * `MAX_DUPLICATE_CANDIDATES`. El caso de uso confirma cuáles tienen el mismo nombre.
   */
  findByName(name: string): Promise<Client[]>;
  /** `actorId` queda como autor de la fila (`created_by` / `updated_by`). */
  save(client: Client, actorId: string): Promise<void>;
}

export interface OpportunityRepository {
  findById(id: OpportunityId): Promise<Opportunity | undefined>;
  findOpenByClient(clientId: ClientId): Promise<Opportunity[]>;
  save(opportunity: Opportunity): Promise<void>;
}

export interface ClientTagGroupRepository {
  findById(id: ClientTagGroupId): Promise<ClientTagGroup | undefined>;
  findByName(name: string): Promise<ClientTagGroup | undefined>;
  nextPosition(): Promise<number>;
  /** Cuántas etiquetas tiene el grupo: un grupo con etiquetas no se borra. */
  countTags(id: ClientTagGroupId): Promise<number>;
  save(group: ClientTagGroup, actorId: string): Promise<void>;
  delete(id: ClientTagGroupId): Promise<void>;
}

export interface ClientTagRepository {
  findById(id: ClientTagId): Promise<ClientTag | undefined>;
  /** Otra etiqueta con el mismo nombre en el mismo grupo (sin distinguir mayúsculas). */
  findInGroup(groupId: ClientTagGroupId | undefined, name: string): Promise<ClientTag | undefined>;
  /** Cuáles de estos IDs existen. */
  findExistingIds(ids: readonly string[]): Promise<readonly string[]>;
  /** Cuántos contactos la tienen (también los de la papelera): una etiqueta en uso no se borra. */
  countUses(id: ClientTagId): Promise<number>;
  /**
   * Pasa los contactos de `source` a `target` (los que ya tenían las dos quedan con una) y
   * devuelve cuántos contactos tenían `source`. No borra `source`.
   */
  moveAssignments(
    source: ClientTagId,
    target: ClientTagId,
    actorId: string,
    now: Date,
  ): Promise<number>;
  save(tag: ClientTag, actorId: string): Promise<void>;
  delete(id: ClientTagId): Promise<void>;
}
