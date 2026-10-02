import type { Client, ClientId } from './client';
import type { ClientActivity } from './client-activity';
import type { ClientImport, ClientImportId, ImportRowProblem } from './client-import';
import type { ClientTag, ClientTagGroup, ClientTagGroupId, ClientTagId } from './client-tag';
import type { ContactKeys } from './duplicate-check';
import type { FeaturedListing } from './featured-listing';
import type { Inquiry, InquiryId } from './inquiry';
import type { Opportunity, OpportunityId } from './opportunity';
import type {
  OpportunityBulkOperation,
  OpportunityBulkOperationId,
} from './opportunity-bulk-operation';
import type { OpportunityCloseReason, OpportunityCloseReasonId } from './opportunity-close-reason';
import type { OpportunityRules } from './opportunity-settings';
import type { OpportunityStage, OpportunityStageId } from './opportunity-stage';

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
  /**
   * Guarda la oportunidad y los cambios de estado pendientes en el historial. `actorId` queda como
   * autor de la fila y de esos cambios.
   */
  save(opportunity: Opportunity, actorId: string): Promise<void>;
  /** Si una regla automática ya aplicó un cambio de estado por este evento. */
  hasStatusChangeFrom(sourceEventId: string): Promise<boolean>;
}

/** Las consultas entrantes (`inquiries`). */
export interface InquiryRepository {
  /** Incluye las borradas. */
  findById(id: InquiryId): Promise<Inquiry | undefined>;
  /**
   * La misma lectura, bloqueando la fila hasta el fin de la transacción: dos asignaciones a la vez
   * no la asignan dos veces.
   */
  findForUpdate(id: InquiryId): Promise<Inquiry | undefined>;
  /** La consulta con ese ID externo en ese canal, si ya entró (incluye las borradas). */
  findByExternal(channel: string, externalId: string): Promise<Inquiry | undefined>;
  /**
   * Inserta una consulta nueva. Devuelve `false` si ya había una con el mismo canal e ID externo
   * (otra entrega del mismo envío que llegó antes): no escribe nada.
   */
  insert(inquiry: Inquiry, actorId: string): Promise<boolean>;
  /** Guarda los cambios de una consulta existente. */
  save(inquiry: Inquiry, actorId: string): Promise<void>;
}

/** Las acciones masivas encoladas (`opportunity_bulk_operations`). */
export interface OpportunityBulkOperationRepository {
  findById(id: OpportunityBulkOperationId): Promise<OpportunityBulkOperation | undefined>;
  /** `actorId` queda como autor de la fila (`created_by` / `updated_by`). */
  save(operation: OpportunityBulkOperation, actorId: string): Promise<void>;
}

/** Catálogo de estados editables: como mucho `MAX_OPPORTUNITY_STAGES`. */
export interface OpportunityStageRepository {
  findById(id: OpportunityStageId): Promise<OpportunityStage | undefined>;
  /** Todos (activos e inactivos), por posición. */
  findAll(): Promise<OpportunityStage[]>;
  save(stage: OpportunityStage, actorId: string): Promise<void>;
}

/** Catálogo de motivos de cierre: como mucho `MAX_CLOSE_REASONS`. */
export interface OpportunityCloseReasonRepository {
  findById(id: OpportunityCloseReasonId): Promise<OpportunityCloseReason | undefined>;
  /** Todos (activos e inactivos), por posición. */
  findAll(): Promise<OpportunityCloseReason[]>;
  save(reason: OpportunityCloseReason, actorId: string): Promise<void>;
}

/** Las reglas automáticas de estado (fila única). */
export interface OpportunitySettingsRepository {
  get(): Promise<OpportunityRules>;
  save(rules: OpportunityRules, actorId: string, now: Date): Promise<void>;
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

/** El timeline de la ficha: solo inserción. */
export interface ClientActivityRepository {
  /** `actorId` queda como autor de la fila. */
  add(activity: ClientActivity, actorId: string): Promise<void>;
  /**
   * Inserta si no existe otra con el mismo ID y devuelve si la insertó: las reacciones a eventos
   * usan el ID del evento, así una reentrega no la duplica.
   */
  record(activity: ClientActivity): Promise<boolean>;
}

export interface FeaturedListingRepository {
  /** Las destacadas vigentes del cliente entre estas propiedades. */
  findActive(clientId: ClientId, propertyIds: readonly string[]): Promise<FeaturedListing[]>;
  save(listing: FeaturedListing, actorId: string): Promise<void>;
}

export interface ClientImportRepository {
  findById(id: ClientImportId): Promise<ClientImport | undefined>;
  /** `actorId` queda como autor de la fila (`created_by` / `updated_by`). */
  save(job: ClientImport, actorId: string): Promise<void>;
  /** Una fila que no se importó. */
  addProblem(importId: ClientImportId, problem: ImportRowProblem, now: Date): Promise<void>;
}
