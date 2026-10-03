import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { Coordinates } from './coordinates';
import type { DevelopmentEvent } from './development.events';
import { propertySlug, suggestPublishAddress } from './listing-text';
import { optionalText } from './property-details';

// Valores del dominio de emprendimientos. Los contracts tienen la misma lista para los formularios
// (el dominio no importa contracts); un test verifica que coincidan.

/** `loading`: cargando información (no se publica). `marketing`: comercializando. */
export const DEVELOPMENT_STATUSES = ['loading', 'marketing'] as const;
export type DevelopmentStatus = (typeof DEVELOPMENT_STATUSES)[number];

export const DEVELOPMENT_KINDS = [
  'building',
  'gated_community',
  'housing_complex',
  'office_building',
  'lots',
  'other',
] as const;
export type DevelopmentKind = (typeof DEVELOPMENT_KINDS)[number];

export const CONSTRUCTION_STATUSES = ['pre_sale', 'under_construction', 'finished'] as const;
export type ConstructionStatus = (typeof CONSTRUCTION_STATUSES)[number];

/** Transiciones válidas: se pasa a comercializar y se vuelve a cargar información. */
const TRANSITIONS: Readonly<Record<DevelopmentStatus, readonly DevelopmentStatus[]>> = {
  loading: ['marketing'],
  marketing: ['loading'],
};

export type DevelopmentId = Id<'Development'>;

/** Atributos de operación que valen para todas las unidades. */
export interface DevelopmentDeal {
  readonly isFinanced: boolean;
  readonly acceptsSwap: boolean;
  readonly immediateDeed: boolean;
}

export interface DevelopmentSnapshot {
  readonly id: DevelopmentId;
  /** Código de referencia: único, lo entrega la numeración de Mi empresa. */
  readonly code: string;
  readonly slug: string;
  /** Nombre público ("Torre Gurruchaga"). */
  readonly name: string;
  /** Los emprendimientos cargados antes del panel pueden no tener tipo. */
  readonly kind: DevelopmentKind | undefined;
  readonly status: DevelopmentStatus;
  readonly constructionStatus: ConstructionStatus | undefined;
  /** Fecha estimada de entrega (`AAAA-MM-DD`). */
  readonly deliveryDate: string | undefined;
  /** Dirección exacta: privada, no se publica. Las unidades la heredan. */
  readonly privateAddress: string;
  readonly publishAddress: string;
  readonly portalTitle: string;
  readonly locationId: string | undefined;
  readonly coordinates: Coordinates | undefined;
  /** Desarrollista: privado. */
  readonly developerName: string | undefined;
  /** Contacto comercial: cliente del módulo clients, solo por ID. Privado. */
  readonly commercialContactClientId: string | undefined;
  readonly websiteUrl: string | undefined;
  readonly description: string;
  readonly financingDetails: string | undefined;
  readonly deal: DevelopmentDeal;
  /** Servicios, ambientes y adicionales (amenities) del catálogo, por ID. */
  readonly featureIds: readonly string[];
  /** Etiquetas del catálogo de propiedades, por ID. */
  readonly tagIds: readonly string[];
  /** Captador: usuario de identity, solo por ID. */
  readonly producerUserId: string | undefined;
  /** Sucursal del captador al dar el alta: de identity, solo por ID. */
  readonly branchId: string | undefined;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewDevelopment {
  readonly id: DevelopmentId;
  readonly code: string;
  readonly name: string;
  readonly kind: DevelopmentKind;
  readonly privateAddress: string;
  /** Vacío: se sugiere a partir de la dirección privada, sin la altura exacta. */
  readonly publishAddress: string | undefined;
  /** Vacío: el nombre. */
  readonly portalTitle: string | undefined;
  readonly developerName: string | undefined;
  readonly commercialContactClientId: string | undefined;
  readonly locationId: string;
  readonly coordinates: Coordinates | undefined;
  readonly producerUserId: string | undefined;
  readonly branchId: string | undefined;
  readonly now: Date;
}

export interface DevelopmentAlreadyDeletedError {
  readonly type: 'DevelopmentAlreadyDeleted';
}
export interface DevelopmentNotDeletedError {
  readonly type: 'DevelopmentNotDeleted';
}
/** Un emprendimiento de la papelera no se edita ni suma unidades: primero se restaura. */
export interface DevelopmentInTrashError {
  readonly type: 'DevelopmentInTrash';
}
export interface InvalidDevelopmentStatusTransitionError {
  readonly type: 'InvalidDevelopmentStatusTransition';
  readonly from: DevelopmentStatus;
  readonly to: DevelopmentStatus;
}
/** No se borra un emprendimiento con unidades activas: las unidades quedarían huérfanas. */
export interface DevelopmentHasUnitsError {
  readonly type: 'DevelopmentHasUnits';
  readonly units: number;
}

/** Lo que una unidad nueva hereda del emprendimiento. */
export interface DevelopmentUnitTemplate {
  readonly privateAddress: string;
  readonly publishAddress: string;
  readonly locationId: string | undefined;
  readonly coordinates: Coordinates | undefined;
  readonly featureIds: readonly string[];
  readonly producerUserId: string | undefined;
  readonly branchId: string | undefined;
}

export const EMPTY_DEVELOPMENT_DEAL: DevelopmentDeal = {
  isFinanced: false,
  acceptsSwap: false,
  immediateDeed: false,
};

/**
 * Dirección para publicar a partir de la privada ("Gurruchaga 1834" → "Gurruchaga al 1800"). Si no
 * termina en una altura de tres cifras o más ("Ruta 8 km 50"), se publica tal cual.
 */
export function suggestDevelopmentPublishAddress(privateAddress: string): string {
  const address = privateAddress.trim();
  const match = /^(.*\D)\s+(\d{3,})$/.exec(address);
  if (match?.[1] === undefined) return address;
  return suggestPublishAddress(match[1], match[2]);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  const before = new Set(a);
  return a.length === b.length && b.every((item) => before.has(item));
}

function sameCoordinates(a: Coordinates | undefined, b: Coordinates | undefined): boolean {
  return a?.latitude === b?.latitude && a?.longitude === b?.longitude;
}

/**
 * Emprendimiento: un desarrollo en pozo o en construcción que agrupa unidades. Cada unidad es una
 * propiedad con su `developmentId`, así se reutilizan el buscador, la ficha, la web y los portales.
 * Nace "cargando información" y pasa a "comercializando" cuando está listo para mostrarse.
 */
export class Development extends AggregateRoot<DevelopmentId, DevelopmentEvent> {
  #state: Omit<DevelopmentSnapshot, 'id'>;

  private constructor(id: DevelopmentId, state: Omit<DevelopmentSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: NewDevelopment): Development {
    const name = input.name.trim();
    const privateAddress = input.privateAddress.trim();
    const development = new Development(input.id, {
      code: input.code,
      slug: propertySlug(name, input.code),
      name,
      kind: input.kind,
      status: 'loading',
      constructionStatus: undefined,
      deliveryDate: undefined,
      privateAddress,
      publishAddress:
        optionalText(input.publishAddress) ?? suggestDevelopmentPublishAddress(privateAddress),
      portalTitle: optionalText(input.portalTitle) ?? name,
      locationId: input.locationId,
      coordinates: input.coordinates,
      developerName: optionalText(input.developerName),
      commercialContactClientId: input.commercialContactClientId,
      websiteUrl: undefined,
      description: '',
      financingDetails: undefined,
      deal: EMPTY_DEVELOPMENT_DEAL,
      featureIds: [],
      tagIds: [],
      producerUserId: input.producerUserId,
      branchId: input.branchId,
      deletedAt: undefined,
      deletedBy: undefined,
      createdAt: input.now,
      updatedAt: input.now,
    });
    development.record({
      type: 'properties.development_created',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { developmentId: input.id, code: input.code },
    });
    return development;
  }

  static restore(snapshot: DevelopmentSnapshot): Development {
    const { id, ...state } = snapshot;
    return new Development(id, state);
  }

  get code(): string {
    return this.#state.code;
  }

  get name(): string {
    return this.#state.name;
  }

  get status(): DevelopmentStatus {
    return this.#state.status;
  }

  get tagIds(): readonly string[] {
    return this.#state.tagIds;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  /** De quién es, para las reglas de pertenencia: el captador y su sucursal. */
  get ownership(): {
    readonly ownerId: string | undefined;
    readonly ownerBranchId: string | undefined;
  } {
    return { ownerId: this.#state.producerUserId, ownerBranchId: this.#state.branchId };
  }

  /**
   * Lo que hereda una unidad nueva: dirección, ubicación, coordenadas, servicios y amenities, captador
   * y sucursal. Un emprendimiento de la papelera no suma unidades.
   */
  unitTemplate(): Result<DevelopmentUnitTemplate, DevelopmentInTrashError> {
    if (this.isDeleted) return err({ type: 'DevelopmentInTrash' });
    const s = this.#state;
    return ok({
      privateAddress: s.privateAddress,
      publishAddress: s.publishAddress,
      locationId: s.locationId,
      coordinates: s.coordinates,
      featureIds: s.featureIds,
      producerUserId: s.producerUserId,
      branchId: s.branchId,
    });
  }

  /**
   * Baja lógica: va a la papelera con quién lo borró y cuándo. Con unidades activas no se puede:
   * primero se borran o se pasan a otro emprendimiento.
   */
  delete(
    by: string,
    activeUnits: number,
    now: Date,
  ): Result<void, DevelopmentAlreadyDeletedError | DevelopmentHasUnitsError> {
    if (this.isDeleted) return err({ type: 'DevelopmentAlreadyDeleted' });
    if (activeUnits > 0) return err({ type: 'DevelopmentHasUnits', units: activeUnits });
    this.#state = { ...this.#state, deletedAt: now, deletedBy: by, updatedAt: now };
    this.record({
      type: 'properties.development_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: { developmentId: this.id, code: this.#state.code },
    });
    return ok(undefined);
  }

  restoreFromTrash(now: Date): Result<void, DevelopmentNotDeletedError> {
    if (!this.isDeleted) return err({ type: 'DevelopmentNotDeleted' });
    this.#state = { ...this.#state, deletedAt: undefined, deletedBy: undefined, updatedAt: now };
    this.record({
      type: 'properties.development_restored',
      aggregateId: this.id,
      occurredAt: now,
      payload: { developmentId: this.id, code: this.#state.code },
    });
    return ok(undefined);
  }

  /** Pasa a comercializar o vuelve a cargar información. Devuelve `false` si ya estaba así. */
  changeStatus(
    to: DevelopmentStatus,
    now: Date,
  ): Result<boolean, DevelopmentInTrashError | InvalidDevelopmentStatusTransitionError> {
    if (this.isDeleted) return err({ type: 'DevelopmentInTrash' });
    const from = this.#state.status;
    if (from === to) return ok(false);
    if (!TRANSITIONS[from].includes(to)) {
      return err({ type: 'InvalidDevelopmentStatusTransition', from, to });
    }
    this.#state = { ...this.#state, status: to, updatedAt: now };
    this.record({
      type: 'properties.development_status_changed',
      aggregateId: this.id,
      occurredAt: now,
      payload: { developmentId: this.id, code: this.#state.code, from, to },
    });
    return ok(true);
  }

  /**
   * Nombre, tipo, título para portales, desarrollista, contacto comercial y página web. Sin título,
   * se usa el nombre. El slug no cambia: es la URL pública y ya puede estar compartida.
   */
  updateGeneral(
    change: {
      readonly name: string;
      readonly kind: DevelopmentKind;
      readonly portalTitle: string | undefined;
      readonly developerName: string | undefined;
      readonly commercialContactClientId: string | undefined;
      readonly websiteUrl: string | undefined;
    },
    now: Date,
  ): Result<boolean, DevelopmentInTrashError> {
    if (this.isDeleted) return err({ type: 'DevelopmentInTrash' });
    const name = change.name.trim();
    const next = {
      name,
      kind: change.kind,
      portalTitle: optionalText(change.portalTitle) ?? name,
      developerName: optionalText(change.developerName),
      commercialContactClientId: change.commercialContactClientId,
      websiteUrl: optionalText(change.websiteUrl),
    };
    const s = this.#state;
    const unchanged =
      s.name === next.name &&
      s.kind === next.kind &&
      s.portalTitle === next.portalTitle &&
      s.developerName === next.developerName &&
      s.commercialContactClientId === next.commercialContactClientId &&
      s.websiteUrl === next.websiteUrl;
    if (unchanged) return ok(false);
    this.#state = { ...s, ...next, updatedAt: now };
    return ok(true);
  }

  /**
   * Dirección privada, dirección para publicar, ubicación y coordenadas. Las unidades ya creadas no
   * cambian: cada una tiene su propia dirección.
   */
  updateLocation(
    change: {
      readonly privateAddress: string;
      readonly publishAddress: string | undefined;
      readonly locationId: string;
      readonly coordinates: Coordinates | undefined;
    },
    now: Date,
  ): Result<boolean, DevelopmentInTrashError> {
    if (this.isDeleted) return err({ type: 'DevelopmentInTrash' });
    const privateAddress = change.privateAddress.trim();
    const next = {
      privateAddress,
      publishAddress:
        optionalText(change.publishAddress) ?? suggestDevelopmentPublishAddress(privateAddress),
      locationId: change.locationId,
      coordinates: change.coordinates,
    };
    const s = this.#state;
    const unchanged =
      s.privateAddress === next.privateAddress &&
      s.publishAddress === next.publishAddress &&
      s.locationId === next.locationId &&
      sameCoordinates(s.coordinates, next.coordinates);
    if (unchanged) return ok(false);
    this.#state = { ...s, ...next, updatedAt: now };
    return ok(true);
  }

  /** Estado de obra, entrega, descripción, atributos de operación y financiación. */
  updateDetails(
    change: {
      readonly constructionStatus: ConstructionStatus | undefined;
      readonly deliveryDate: string | undefined;
      readonly description: string;
      readonly financingDetails: string | undefined;
      readonly deal: DevelopmentDeal;
    },
    now: Date,
  ): Result<boolean, DevelopmentInTrashError> {
    if (this.isDeleted) return err({ type: 'DevelopmentInTrash' });
    const next = {
      constructionStatus: change.constructionStatus,
      deliveryDate: change.deliveryDate,
      description: change.description.trim(),
      financingDetails: optionalText(change.financingDetails),
      deal: { ...change.deal },
    };
    const s = this.#state;
    const unchanged =
      s.constructionStatus === next.constructionStatus &&
      s.deliveryDate === next.deliveryDate &&
      s.description === next.description &&
      s.financingDetails === next.financingDetails &&
      s.deal.isFinanced === next.deal.isFinanced &&
      s.deal.acceptsSwap === next.deal.acceptsSwap &&
      s.deal.immediateDeed === next.deal.immediateDeed;
    if (unchanged) return ok(false);
    this.#state = { ...s, ...next, updatedAt: now };
    return ok(true);
  }

  /** Servicios y amenities. Que existan en el catálogo lo verifica el caso de uso. */
  updateFeatures(
    featureIds: readonly string[],
    now: Date,
  ): Result<boolean, DevelopmentInTrashError> {
    if (this.isDeleted) return err({ type: 'DevelopmentInTrash' });
    const next = [...new Set(featureIds)];
    if (sameList(this.#state.featureIds, next)) return ok(false);
    this.#state = { ...this.#state, featureIds: next, updatedAt: now };
    return ok(true);
  }

  /** Las etiquetas que quedan. Que existan en el catálogo lo verifica el caso de uso. */
  setTags(tagIds: readonly string[], now: Date): Result<boolean, DevelopmentInTrashError> {
    if (this.isDeleted) return err({ type: 'DevelopmentInTrash' });
    const next = [...new Set(tagIds)];
    if (sameList(this.#state.tagIds, next)) return ok(false);
    this.#state = { ...this.#state, tagIds: next, updatedAt: now };
    return ok(true);
  }

  toSnapshot(): DevelopmentSnapshot {
    return { id: this.id, ...this.#state };
  }
}
