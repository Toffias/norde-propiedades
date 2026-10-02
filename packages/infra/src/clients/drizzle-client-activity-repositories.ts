import {
  FeaturedListing,
  OPPORTUNITY_STATUSES,
  type ClientActivity,
  type ClientActivityBody,
  type ClientActivityRepository,
  type ClientId,
  type FeaturedListingRepository,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { fromJsonb, toJsonb } from '../db/json';
import { clientActivities, featuredListings } from '../db/schema';

const Status = z.enum(OPPORTUNITY_STATUSES);

/** El `body` de cada tipo, tal como se guarda (el tipo va en su columna). */
const ActivityBodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), text: z.string() }),
  z.object({
    kind: z.literal('status_change'),
    from: Status.optional(),
    to: Status,
    fromStageId: z.string().optional(),
    toStageId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('listing_sent'),
    channel: z.string(),
    propertyIds: z.array(z.string()),
  }),
  z.object({ kind: z.literal('listing_viewed'), propertyId: z.string().optional() }),
  z.object({
    kind: z.literal('listing_reaction'),
    propertyId: z.string(),
    reaction: z.enum(['liked', 'disliked']),
  }),
  z.object({
    kind: z.literal('inquiry'),
    channel: z.string(),
    type: z.string(),
    intent: z.string(),
    propertyId: z.string().optional(),
    followUp: z.boolean(),
    note: z.string().optional(),
  }),
  z.object({ kind: z.literal('message'), conversationId: z.string(), channel: z.string() }),
  z.object({ kind: z.literal('merge'), mergedClientId: z.string() }),
]);

/** Lee el `body` de una fila: la columna `kind` manda. Una fila que no valida está corrupta. */
export function storedActivityBody(kind: string, body: unknown): ClientActivityBody {
  const raw = fromJsonb(body);
  const fields = typeof raw === 'object' && raw !== null ? raw : {};
  const parsed = ActivityBodySchema.parse({ ...fields, kind });
  switch (parsed.kind) {
    case 'status_change':
      return {
        kind: parsed.kind,
        from: parsed.from,
        to: parsed.to,
        fromStageId: parsed.fromStageId,
        toStageId: parsed.toStageId,
      };
    case 'listing_viewed':
      return { kind: parsed.kind, propertyId: parsed.propertyId };
    case 'inquiry':
      return {
        kind: parsed.kind,
        channel: parsed.channel,
        type: parsed.type,
        intent: parsed.intent,
        propertyId: parsed.propertyId,
        followUp: parsed.followUp,
        note: parsed.note,
      };
    case 'note':
    case 'listing_sent':
    case 'listing_reaction':
    case 'message':
    case 'merge':
      return parsed;
  }
}

function activityRow(activity: ClientActivity, actorId: string) {
  const { kind, ...body } = activity.body;
  return {
    id: activity.id,
    clientId: activity.clientId,
    opportunityId: activity.opportunityId ?? null,
    kind,
    actorId: activity.actorId,
    body: toJsonb(body),
    occurredAt: activity.occurredAt,
    createdAt: activity.occurredAt,
    updatedAt: activity.occurredAt,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

/** El timeline de la ficha (`client_activities`): solo inserción. */
export class DrizzleClientActivityRepository implements ClientActivityRepository {
  constructor(private readonly db: DbExecutor) {}

  async add(activity: ClientActivity, actorId: string): Promise<void> {
    await this.db.insert(clientActivities).values(activityRow(activity, actorId));
  }

  async record(activity: ClientActivity): Promise<boolean> {
    const inserted = await this.db
      .insert(clientActivities)
      .values(activityRow(activity, activity.actorId))
      .onConflictDoNothing({ target: clientActivities.id })
      .returning({ id: clientActivities.id });
    return inserted.length > 0;
  }
}

/** IDs leídos de la base: si uno no es válido, la fila está corrupta. */
function storedId<TBrand extends string>(value: string) {
  const id = parseId<TBrand>(value);
  if (id.isErr()) throw new Error(`Invalid id stored in the database: ${value}`);
  return id.value;
}

export class DrizzleFeaturedListingRepository implements FeaturedListingRepository {
  constructor(private readonly db: DbExecutor) {}

  async findActive(clientId: ClientId, propertyIds: readonly string[]) {
    if (propertyIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(featuredListings)
      .where(
        and(
          eq(featuredListings.clientId, clientId),
          inArray(featuredListings.propertyId, [...propertyIds]),
          isNull(featuredListings.removedAt),
        ),
      );
    return rows.map((row) =>
      FeaturedListing.restore({
        id: storedId<'FeaturedListing'>(row.id),
        clientId: storedId<'Client'>(row.clientId),
        propertyId: row.propertyId,
        featuredBy: row.featuredBy,
        featuredAt: row.featuredAt,
        removedAt: row.removedAt ?? undefined,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async save(listing: FeaturedListing, actorId: string): Promise<void> {
    const s = listing.toSnapshot();
    await this.db
      .insert(featuredListings)
      .values({
        id: s.id,
        clientId: s.clientId,
        propertyId: s.propertyId,
        featuredBy: s.featuredBy,
        featuredAt: s.featuredAt,
        removedAt: s.removedAt ?? null,
        createdAt: s.featuredAt,
        updatedAt: s.updatedAt,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        target: featuredListings.id,
        set: { removedAt: s.removedAt ?? null, updatedAt: s.updatedAt, updatedBy: actorId },
      });
  }
}
