import {
  auditAction,
  auditCreated,
  diffChanges,
  err,
  nextId,
  ok,
  parseId,
  type Actor,
  type AuditState,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  CreatePropertyFromAppraisalInputSchema,
  type CreatePropertyFromAppraisalInput,
} from '../../contracts';
import { MediaItem } from '../../domain/media-item';
import type { MediaOwner } from '../../domain/media-owner';
import { Property, type OperationInput, type PropertyId } from '../../domain/property';
import {
  EMPTY_CHARACTERISTICS,
  EMPTY_INTERNAL_INFO,
  validateCharacteristics,
  type PropertyCharacteristics,
} from '../../domain/property-details';
import { childState, mediaAuditState, mediaKey, ownerTarget } from '../media-support';
import type { PropertiesTransaction, PropertiesUnitOfWork } from '../ports/properties-transaction';
import type {
  ReferenceCodeAllocator,
  ReferenceCodeUnavailableError,
} from '../ports/reference-code-allocator';
import { invalidInput, propertyAuditState, type InvalidInputError } from '../property-support';

export type CreatePropertyFromAppraisalError =
  ForbiddenError | InvalidInputError | ReferenceCodeUnavailableError;

/** `created`: se creó el borrador. `exists`: ya estaba (el evento llegó dos veces). */
export type CreatePropertyFromAppraisalOutcome = 'created' | 'exists';

type Listing = CreatePropertyFromAppraisalInput['listing'];

/** Una foto copiada de la tasación a la galería, todavía sin registrar. */
interface CopiedPhoto {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly mediaId: MediaItem['id'];
}

function operationsOf(listing: Listing): OperationInput[] {
  const operations: OperationInput[] = [];
  if (listing.sale) {
    const { priceCents, currency } = listing.sale;
    operations.push({ operation: 'sale', currency, priceCents: BigInt(priceCents) });
  }
  if (listing.rent) {
    const { priceCents, currency } = listing.rent;
    operations.push({ operation: 'rent', currency, priceCents: BigInt(priceCents) });
  }
  return operations;
}

/** Los datos de la tasación; si las superficies no cierran (cubierta mayor que la total), sin ellas. */
function characteristicsOf(listing: Listing): PropertyCharacteristics {
  const full = {
    ...EMPTY_CHARACTERISTICS,
    rooms: listing.rooms,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    condition: listing.condition,
    surfaceTotalM2: listing.surfaceTotalM2,
    surfaceCoveredM2: listing.surfaceCoveredM2,
  };
  const valid = validateCharacteristics(full);
  return valid.isOk()
    ? valid.value
    : { ...full, surfaceTotalM2: undefined, surfaceCoveredM2: undefined };
}

/**
 * Reacción a `appraisals.appraisal_converted`: crea la captación en borrador con el ID que ya quedó
 * en la tasación. Lleva el tipo, la dirección (la calle; el resto se completa en la ficha), las
 * características, una operación por cada valor sugerido (al máximo), el captador y la sucursal, el
 * tasador, el solicitante como propietario y una copia de las fotos (la primera es la portada).
 * Idempotente: si la propiedad ya existe, no hace nada.
 */
export class CreatePropertyFromAppraisal {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly codes: ReferenceCodeAllocator;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreatePropertyFromAppraisalInput,
    actor: Actor,
  ): Promise<Result<CreatePropertyFromAppraisalOutcome, CreatePropertyFromAppraisalError>> {
    if (!actor.can('properties:create-from-appraisal')) return err({ type: 'Forbidden' });
    const parsed = CreatePropertyFromAppraisalInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { listing, requesterClientId, appraisalId } = parsed.data;
    const id = parseId<'Property'>(listing.propertyId);
    if (id.isErr()) return err({ type: 'InvalidInput', issues: ['ID de propiedad inválido.'] });
    const propertyId = id.value;

    if (await this.#exists(propertyId)) return ok('exists');

    const code = await this.deps.codes.allocate(
      {
        kind: listing.propertyType,
        producerUserId: listing.producerUserId,
        branchId: listing.branchId,
      },
      actor,
    );
    if (code.isErr()) return err(code.error);

    // Fuera de la transacción: copiar archivos en el storage. Si algo falla, se borran las copias.
    const owner: MediaOwner = { kind: 'property', id: propertyId };
    const copies = await this.#copyPhotos(owner, listing.photoKeys);
    try {
      const outcome = await this.deps.uow.run(async (tx) => {
        if (await tx.properties.findById(propertyId)) return 'exists' as const;
        await this.#create(tx, actor, {
          propertyId,
          code: code.value,
          listing,
          requesterClientId,
          appraisalId,
          owner,
          copies,
        });
        return 'created' as const;
      });
      if (outcome === 'exists') await this.#discard(copies);
      return ok(outcome);
    } catch (error) {
      await this.#discard(copies);
      throw error;
    }
  }

  async #exists(propertyId: PropertyId): Promise<boolean> {
    return (await this.deps.uow.run((tx) => tx.properties.findById(propertyId))) !== undefined;
  }

  async #copyPhotos(owner: MediaOwner, keys: readonly string[]): Promise<CopiedPhoto[]> {
    const copies: CopiedPhoto[] = [];
    try {
      for (const sourceKey of keys) {
        const original = await this.deps.storage.get(sourceKey);
        // Una foto que ya no está (se borró antes de que corra el job) no se copia.
        if (!original) continue;
        const mediaId = nextId<'MediaItem'>(this.deps.ids);
        const key = mediaKey(owner, mediaId, 'original');
        await this.deps.storage.put({
          key,
          contentType: original.contentType,
          bytes: original.bytes,
        });
        copies.push({
          key,
          contentType: original.contentType,
          sizeBytes: original.bytes.byteLength,
          mediaId,
        });
      }
    } catch (error) {
      await this.#discard(copies);
      throw error;
    }
    return copies;
  }

  async #discard(copies: readonly CopiedPhoto[]): Promise<void> {
    for (const copy of copies) await this.deps.storage.delete(copy.key);
  }

  async #create(
    tx: PropertiesTransaction,
    actor: Actor,
    data: {
      readonly propertyId: PropertyId;
      readonly code: string;
      readonly listing: Listing;
      readonly requesterClientId: string;
      readonly appraisalId: string;
      readonly owner: MediaOwner;
      readonly copies: readonly CopiedPhoto[];
    },
  ): Promise<void> {
    const { listing } = data;
    const now = this.deps.clock.now();
    const [first, ...others] = operationsOf(listing);
    // El contract exige al menos un valor sugerido.
    if (!first) throw new Error('A converted appraisal without suggested values');

    const property = expectOk(
      Property.create({
        id: data.propertyId,
        code: data.code,
        kind: listing.propertyType,
        operation: first,
        address: {
          street: listing.address ?? '',
          streetNumber: undefined,
          floor: undefined,
          unit: undefined,
          neighborhood: '',
          city: '',
          province: '',
        },
        publishAddress: undefined,
        portalTitle: undefined,
        coordinates: undefined,
        locationId: undefined,
        producerUserId: listing.producerUserId,
        branchId: listing.branchId,
        now,
      }),
    );
    // Recién creada no está en la papelera, los precios no son negativos (vienen de centavos sin
    // signo) y las características ya se validaron: nada de esto puede fallar.
    if (others.length > 0) expectOk(property.setOperations([first, ...others], now));
    expectOk(property.updateCharacteristics(characteristicsOf(listing), now));
    if (listing.appraiserUserId !== undefined) {
      expectOk(
        property.updateInternalInfo(
          { ...EMPTY_INTERNAL_INFO, appraiserUserIds: [listing.appraiserUserId] },
          now,
        ),
      );
    }

    await tx.properties.save(property, actor.id);
    await tx.owners.add(property.id, data.requesterClientId, actor.id);
    await tx.events.publish(property.pullEvents());
    const s = property.toSnapshot();
    await tx.audit.record(
      auditCreated(
        actor,
        {
          action: 'property.created_from_appraisal',
          entityType: 'property',
          entityId: property.id,
          clientIds: [data.requesterClientId],
        },
        {
          ...withoutEmptyTexts(propertyAuditState(property)),
          appraisalId: data.appraisalId,
          appraisalCode: listing.appraisalCode,
          ownerClientIds: [data.requesterClientId],
          appraiserUserIds:
            s.internal.appraiserUserIds.length === 0 ? undefined : [...s.internal.appraiserUserIds],
          rooms: s.characteristics.rooms,
          bedrooms: s.characteristics.bedrooms,
          bathrooms: s.characteristics.bathrooms,
          condition: s.characteristics.condition,
          surfaceTotalM2: s.characteristics.surfaceTotalM2,
          surfaceCoveredM2: s.characteristics.surfaceCoveredM2,
        },
      ),
    );

    for (const [position, copy] of data.copies.entries()) {
      const item = expectOk(
        MediaItem.upload({
          id: copy.mediaId,
          owner: data.owner,
          storageKey: copy.key,
          contentType: copy.contentType,
          sizeBytes: copy.sizeBytes,
          position,
          isCover: position === 0,
          uploadedBy: actor.id,
          now,
        }),
      );
      await tx.media.save(item, actor.id);
      await tx.events.publish(item.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          ownerTarget('media_added', data.owner),
          diffChanges({}, childState(`media.${item.id}`, mediaAuditState(item))),
        ),
      );
    }
  }
}

/** Barrio, localidad y provincia quedan vacíos hasta completar la ubicación: no van al historial. */
function withoutEmptyTexts(state: AuditState): AuditState {
  return Object.fromEntries(Object.entries(state).filter(([, value]) => value !== ''));
}

/** Para pasos que no pueden fallar con datos ya validados: si fallan, es un error de programación. */
function expectOk<T, E extends { readonly type: string }>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Unexpected ${result.error.type} creating from appraisal`);
  return result.value;
}
