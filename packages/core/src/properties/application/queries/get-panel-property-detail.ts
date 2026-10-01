import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  PropertyIdInputSchema,
  type PanelPropertyDetail,
  type PanelUserRef,
  type PropertyIdInput,
} from '../../contracts';
import type { Property } from '../../domain/property';
import { isPubliclyListed } from '../../domain/property-status';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyDetailLookups } from '../ports/property-detail-lookups';
import type { UserNames } from '../ports/user-names';
import {
  findProperty,
  invalidInput,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';

export type GetPanelPropertyDetailError =
  ForbiddenError | InvalidInputError | PropertyNotFoundError;

/** Arma la ficha a partir del aggregate y las búsquedas de nombres. La usan la página y los PDF. */
export async function buildPanelPropertyDetail(
  property: Property,
  deps: { readonly lookups: PropertyDetailLookups; readonly users: UserNames },
): Promise<PanelPropertyDetail> {
  const s = property.toSnapshot();
  const { lookups } = deps;
  const [locationPath, features, tags, definitions, owners, cover, counts, createdBy] =
    await Promise.all([
      s.locationId === undefined ? [] : lookups.locationPath(s.locationId),
      lookups.features(s.featureIds),
      lookups.tags(s.tagIds),
      lookups.customAttributes(s.customAttributes.map((entry) => entry.attributeId)),
      lookups.owners(s.id),
      lookups.cover(s.id),
      lookups.counts(s.id),
      lookups.createdBy(s.id),
    ]);
  const userIds = [
    s.producerUserId,
    s.internal.maintenanceUserId,
    createdBy,
    ...s.internal.appraiserUserIds,
  ].filter((id): id is string => id !== undefined);
  const names = await deps.users.names([...new Set(userIds)]);
  const ref = (id: string | undefined): PanelUserRef | undefined =>
    id === undefined ? undefined : { id, name: names.get(id) };
  const values = new Map(s.customAttributes.map((entry) => [entry.attributeId, entry.value]));

  return {
    id: s.id,
    code: s.code,
    slug: s.slug,
    propertyType: s.kind,
    status: s.status,
    statusChangedAt: s.statusChangedAt,
    address: s.address,
    publishAddress: s.publishAddress,
    portalTitle: s.portalTitle,
    description: s.description,
    locationId: s.locationId,
    locationPath,
    coordinates:
      s.coordinates === undefined
        ? undefined
        : { latitude: s.coordinates.latitude, longitude: s.coordinates.longitude },
    operations: s.operations,
    characteristics: s.characteristics,
    deal: s.deal,
    features,
    tags,
    customAttributes: definitions.map((definition) => ({
      ...definition,
      value: values.get(definition.id),
    })),
    internal: {
      maintenance: ref(s.internal.maintenanceUserId),
      appraisers: s.internal.appraiserUserIds.map((id) => ({ id, name: names.get(id) })),
      keysLocation: s.internal.keysLocation,
      legalInfo: s.internal.legalInfo,
      internalComments: s.internal.internalComments,
    },
    publication: s.publication,
    isPubliclyListed:
      s.deletedAt === undefined &&
      isPubliclyListed({ status: s.status, publishedOnWeb: s.publication.publishedOnWeb }),
    producer: ref(s.producerUserId),
    branchId: s.branchId,
    owners,
    cover,
    counts,
    createdAt: s.createdAt,
    createdBy: ref(createdBy),
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
  };
}

/**
 * La ficha del panel: a diferencia de `GetPropertyDetail` (la pública), muestra borradores, la
 * papelera y los datos internos. Con `properties:read`, como el buscador.
 */
export class GetPanelPropertyDetail {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly lookups: PropertyDetailLookups;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: PropertyIdInput,
    actor: Actor,
  ): Promise<Result<PanelPropertyDetail, GetPanelPropertyDetailError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = PropertyIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const property = await this.deps.uow.run((tx) =>
      findProperty(tx.properties, parsed.data.propertyId),
    );
    if (!property) return err({ type: 'PropertyNotFound' });
    return ok(await buildPanelPropertyDetail(property, this.deps));
  }
}
