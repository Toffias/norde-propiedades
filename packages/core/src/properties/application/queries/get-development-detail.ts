import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  DevelopmentIdInputSchema,
  type DevelopmentDetail,
  type DevelopmentIdInput,
} from '../../contracts';
import { findDevelopment, type DevelopmentNotFoundError } from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyDetailLookups } from '../ports/property-detail-lookups';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';

export type GetDevelopmentDetailError =
  ForbiddenError | InvalidInputError | DevelopmentNotFoundError;

/** La ficha del emprendimiento, con `developments:read`. También los de la papelera. */
export class GetDevelopmentDetail {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly lookups: PropertyDetailLookups;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: DevelopmentIdInput,
    actor: Actor,
  ): Promise<Result<DevelopmentDetail, GetDevelopmentDetailError>> {
    if (!actor.can('developments:read')) return err({ type: 'Forbidden' });
    const parsed = DevelopmentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const loaded = await this.deps.uow.run(async (tx) => {
      const development = await findDevelopment(tx.developments, parsed.data.developmentId);
      if (!development) return undefined;
      const [unitCount, availableUnitCount] = await Promise.all([
        tx.developments.countActiveUnits(development.id),
        tx.developments.countAvailableUnits(development.id),
      ]);
      return { development, unitCount, availableUnitCount };
    });
    if (!loaded) return err({ type: 'DevelopmentNotFound' });
    const s = loaded.development.toSnapshot();

    const { lookups } = this.deps;
    const [locationPath, features, tags, contactName, names] = await Promise.all([
      s.locationId === undefined ? [] : lookups.locationPath(s.locationId),
      lookups.features(s.featureIds),
      lookups.tags(s.tagIds),
      s.commercialContactClientId === undefined
        ? undefined
        : lookups.clientName(s.commercialContactClientId),
      this.deps.users.names([
        ...new Set([
          ...(s.producerUserId === undefined ? [] : [s.producerUserId]),
          ...s.chances.map((c) => c.userId),
        ]),
      ]),
    ]);

    return ok({
      id: s.id,
      code: s.code,
      slug: s.slug,
      name: s.name,
      developmentType: s.kind,
      status: s.status,
      constructionStatus: s.constructionStatus,
      deliveryDate: s.deliveryDate,
      privateAddress: s.privateAddress,
      publishAddress: s.publishAddress,
      portalTitle: s.portalTitle,
      locationId: s.locationId,
      locationPath,
      coordinates:
        s.coordinates === undefined
          ? undefined
          : { latitude: s.coordinates.latitude, longitude: s.coordinates.longitude },
      developerName: s.developerName,
      commercialContact:
        s.commercialContactClientId === undefined
          ? undefined
          : { id: s.commercialContactClientId, name: contactName },
      websiteUrl: s.websiteUrl,
      description: s.description,
      financingDetails: s.financingDetails,
      ...s.deal,
      features,
      tags,
      producer:
        s.producerUserId === undefined
          ? undefined
          : { id: s.producerUserId, name: names.get(s.producerUserId) },
      chances: s.chances.map((c) => ({
        user: { id: c.userId, name: names.get(c.userId) },
        weight: c.weight,
      })),
      branchId: s.branchId,
      unitCount: loaded.unitCount,
      availableUnitCount: loaded.availableUnitCount,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      deletedAt: s.deletedAt,
    });
  }
}
