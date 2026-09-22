import {
  Client,
  CONTACT_CHANNELS,
  OPPORTUNITY_INTENTS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPES,
  Opportunity,
  type ClientId,
  type ClientRepository,
  type OpportunityId,
  type OpportunityRepository,
  type OpportunitySearch,
} from '@norde/core/clients';
import { Email, parseId, Phone, type Result } from '@norde/core/shared';
import { eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { fromJsonb, toJsonb } from '../db/json';
import { clientChannels, clients, opportunities } from '../db/schema';

const ChannelSchema = z.enum(CONTACT_CHANNELS);

const OpportunityRowSchema = z.object({
  originChannel: ChannelSchema,
  type: z.enum(OPPORTUNITY_TYPES),
  intent: z.enum(OPPORTUNITY_INTENTS),
  status: z.enum(OPPORTUNITY_STATUSES),
});

const NotesSchema = z.array(z.object({ text: z.string(), createdAt: z.iso.datetime() }));

const SearchSchema = z
  .object({
    operation: z.string(),
    propertyType: z.string(),
    location: z.string(),
    currency: z.string(),
    minPriceCents: z.bigint(),
    maxPriceCents: z.bigint(),
    minRooms: z.number(),
    maxRooms: z.number(),
    minBedrooms: z.number(),
    amenities: z.array(z.string()),
  })
  .partial();

/** IDs leídos de la base: si uno no es válido, la fila está corrupta. */
function storedId<TBrand extends string>(value: string) {
  const id = parseId<TBrand>(value);
  if (id.isErr()) throw new Error(`Invalid id stored in the database: ${value}`);
  return id.value;
}

function storedValue<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value object stored in the database');
  return result.value;
}

export class DrizzleClientRepository implements ClientRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: ClientId) {
    return this.findOneWhere(eq(clients.id, id));
  }

  findByPhone(phone: Phone) {
    return this.findOneWhere(eq(clients.phoneMatchKey, phone.matchKey));
  }

  findByEmail(email: Email) {
    return this.findOneWhere(eq(clients.email, email.value));
  }

  async save(client: Client): Promise<void> {
    const s = client.toSnapshot();
    const row = {
      id: s.id,
      name: s.name ?? null,
      phoneE164: s.phone?.e164 ?? null,
      phoneMatchKey: s.phone?.matchKey ?? null,
      email: s.email?.value ?? null,
      createdAt: s.createdAt,
      updatedAt: s.channels.reduce(
        (latest, c) => (c.lastContactAt > latest ? c.lastContactAt : latest),
        s.createdAt,
      ),
    };
    await this.db
      .insert(clients)
      .values(row)
      .onConflictDoUpdate({
        target: clients.id,
        set: {
          name: row.name,
          phoneE164: row.phoneE164,
          phoneMatchKey: row.phoneMatchKey,
          email: row.email,
          updatedAt: row.updatedAt,
        },
      });

    for (const channel of s.channels) {
      await this.db
        .insert(clientChannels)
        .values({ clientId: s.id, ...channel })
        .onConflictDoUpdate({
          target: [clientChannels.clientId, clientChannels.channel, clientChannels.externalId],
          set: { lastContactAt: channel.lastContactAt },
        });
    }
  }

  private async findOneWhere(where: SQL): Promise<Client | undefined> {
    const [row] = await this.db.select().from(clients).where(where).limit(1);
    if (!row) return undefined;

    const channels = await this.db
      .select()
      .from(clientChannels)
      .where(eq(clientChannels.clientId, row.id))
      .orderBy(clientChannels.firstContactAt);

    return Client.restore({
      id: storedId<'Client'>(row.id),
      name: row.name ?? undefined,
      phone: row.phoneE164 === null ? undefined : storedValue(Phone.create(row.phoneE164)),
      email: row.email === null ? undefined : storedValue(Email.create(row.email)),
      channels: channels.map((c) => ({
        channel: ChannelSchema.parse(c.channel),
        externalId: c.externalId,
        firstContactAt: c.firstContactAt,
        lastContactAt: c.lastContactAt,
      })),
      createdAt: row.createdAt,
    });
  }
}

export class DrizzleOpportunityRepository implements OpportunityRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: OpportunityId) {
    const [row] = await this.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .limit(1);
    return row && toOpportunity(row);
  }

  async findOpenByClient(clientId: ClientId) {
    const rows = await this.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.clientId, clientId))
      .orderBy(opportunities.createdAt);
    // Qué estados cuentan como abiertos lo decide el dominio, no el SQL.
    return rows.map(toOpportunity).filter((o) => o.isOpen());
  }

  async save(opportunity: Opportunity): Promise<void> {
    const s = opportunity.toSnapshot();
    const row = {
      id: s.id,
      clientId: s.clientId,
      originChannel: s.originChannel,
      type: s.type,
      intent: s.intent,
      status: s.status,
      propertyId: s.propertyId ?? null,
      search: s.search === undefined ? null : toJsonb(s.search),
      notes: toJsonb(s.notes),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
    await this.db
      .insert(opportunities)
      .values(row)
      .onConflictDoUpdate({
        target: opportunities.id,
        set: {
          intent: row.intent,
          status: row.status,
          search: row.search,
          notes: row.notes,
          updatedAt: row.updatedAt,
        },
      });
  }
}

function toOpportunity(row: typeof opportunities.$inferSelect): Opportunity {
  const enums = OpportunityRowSchema.parse(row);
  const search: OpportunitySearch | undefined =
    row.search === null ? undefined : SearchSchema.parse(fromJsonb(row.search));
  return Opportunity.restore({
    id: storedId<'Opportunity'>(row.id),
    clientId: storedId<'Client'>(row.clientId),
    ...enums,
    propertyId: row.propertyId ?? undefined,
    search,
    notes: NotesSchema.parse(row.notes).map((n) => ({
      text: n.text,
      createdAt: new Date(n.createdAt),
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
