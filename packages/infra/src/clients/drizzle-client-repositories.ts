import {
  Client,
  CLIENT_KINDS,
  CLIENT_TYPES,
  CONTACT_CHANNELS,
  EMAIL_KINDS,
  MAX_DUPLICATE_CANDIDATES,
  OPPORTUNITY_INTENTS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPES,
  Opportunity,
  PHONE_KINDS,
  type ClientId,
  type ClientRepository,
  type ClientSnapshot,
  type ContactKeys,
  type OpportunityId,
  type OpportunityRepository,
  type OpportunitySearch,
} from '@norde/core/clients';
import { Email, parseId, Phone, type IdGenerator, type Result } from '@norde/core/shared';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { fromJsonb, toJsonb } from '../db/json';
import { clientChannels, clientEmails, clientPhones, clients, opportunities } from '../db/schema';

const ChannelSchema = z.enum(CONTACT_CHANNELS);
const KindSchema = z.enum(CLIENT_KINDS);
const PhoneKindSchema = z.enum(PHONE_KINDS);
const EmailKindSchema = z.enum(EMAIL_KINDS);
const ClientTypesSchema = z.array(z.enum(CLIENT_TYPES));

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
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
  ) {}

  findById(id: ClientId) {
    return this.findOneWhere(eq(clients.id, id));
  }

  async findMatching(contact: ContactKeys): Promise<Client[]> {
    const keys = contact.phones.map((p) => p.matchKey);
    const addresses = contact.emails.map((e) => e.value);
    const limit = MAX_DUPLICATE_CANDIDATES;

    // El principal está en `clients` (con índice único); todos, en las filas hijas.
    const lookups: (() => Promise<{ readonly id: string }[]>)[] = [];
    if (keys.length > 0) {
      lookups.push(
        () =>
          this.db
            .select({ id: clients.id })
            .from(clients)
            .where(inArray(clients.phoneMatchKey, keys))
            .limit(limit),
        () =>
          this.db
            .selectDistinct({ id: clientPhones.clientId })
            .from(clientPhones)
            .where(inArray(clientPhones.phoneMatchKey, keys))
            .limit(limit),
      );
    }
    if (addresses.length > 0) {
      lookups.push(
        () =>
          this.db
            .select({ id: clients.id })
            .from(clients)
            .where(inArray(clients.email, addresses))
            .limit(limit),
        () =>
          this.db
            .selectDistinct({ id: clientEmails.clientId })
            .from(clientEmails)
            .where(inArray(sql`lower(${clientEmails.email})`, addresses))
            .limit(limit),
      );
    }
    // En serie: dentro de una transacción todas usan la misma conexión.
    const ids = new Set<string>();
    for (const lookup of lookups) for (const row of await lookup()) ids.add(row.id);
    return this.loadAll([...ids].slice(0, limit));
  }

  async findByName(name: string): Promise<Client[]> {
    const rows = await this.db
      .select({ id: clients.id })
      .from(clients)
      .where(and(sql`lower(${clients.name}) = lower(${name.trim()})`, isNull(clients.deletedAt)))
      .limit(MAX_DUPLICATE_CANDIDATES);
    return this.loadAll(rows.map((row) => row.id));
  }

  async save(client: Client, actorId: string): Promise<void> {
    const s = client.toSnapshot();
    const main = s.phones[0]?.phone;
    const row = {
      id: s.id,
      kind: s.kind,
      name: s.name ?? null,
      phoneE164: main?.e164 ?? null,
      phoneMatchKey: main?.matchKey ?? null,
      email: s.emails[0]?.email.value ?? null,
      clientTypes: [...s.clientTypes],
      agentId: s.agentId ?? null,
      branchId: s.branchId ?? null,
      companyName: s.profile.companyName ?? null,
      jobTitle: s.profile.jobTitle ?? null,
      website: s.profile.website ?? null,
      birthDate: s.profile.birthDate ?? null,
      address: s.profile.address ?? null,
      country: s.profile.country ?? null,
      language: s.profile.language ?? null,
      documentType: s.profile.documentType ?? null,
      documentNumber: s.profile.documentNumber ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
      deletedAt: s.deletedAt ?? null,
      deletedBy: s.deletedBy ?? null,
    };
    await this.db
      .insert(clients)
      .values({ ...row, createdAt: s.createdAt, createdBy: actorId })
      .onConflictDoUpdate({ target: clients.id, set: row });

    await this.savePhones(s, actorId);
    await this.saveEmails(s, actorId);

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

  /** Las filas se reemplazan solo si cambió la lista; el orden es la posición. */
  private async savePhones(s: ClientSnapshot, actorId: string): Promise<void> {
    const stored = await this.db
      .select()
      .from(clientPhones)
      .where(eq(clientPhones.clientId, s.id))
      .orderBy(clientPhones.position);
    const same =
      stored.length === s.phones.length &&
      stored.every((row, i) => {
        const entry = s.phones[i];
        return (
          entry?.kind === row.kind &&
          entry.phone.e164 === row.phoneE164 &&
          (entry.contactHours ?? null) === row.contactHours
        );
      });
    if (same) return;

    await this.db.delete(clientPhones).where(eq(clientPhones.clientId, s.id));
    if (s.phones.length === 0) return;
    await this.db.insert(clientPhones).values(
      s.phones.map((entry, position) => ({
        id: this.ids.next(),
        clientId: s.id,
        kind: entry.kind,
        phoneE164: entry.phone.e164,
        phoneMatchKey: entry.phone.matchKey,
        contactHours: entry.contactHours ?? null,
        position,
        createdAt: s.updatedAt,
        updatedAt: s.updatedAt,
        createdBy: actorId,
        updatedBy: actorId,
      })),
    );
  }

  /** Los emails no tienen posición: los UUID v7 son crecientes y el ID guarda el orden. */
  private async saveEmails(s: ClientSnapshot, actorId: string): Promise<void> {
    const stored = await this.db
      .select()
      .from(clientEmails)
      .where(eq(clientEmails.clientId, s.id))
      .orderBy(clientEmails.id);
    const same =
      stored.length === s.emails.length &&
      stored.every((row, i) => {
        const entry = s.emails[i];
        return entry?.kind === row.kind && entry.email.value === row.email;
      });
    if (same) return;

    await this.db.delete(clientEmails).where(eq(clientEmails.clientId, s.id));
    if (s.emails.length === 0) return;
    await this.db.insert(clientEmails).values(
      s.emails.map((entry) => ({
        id: this.ids.next(),
        clientId: s.id,
        kind: entry.kind,
        email: entry.email.value,
        createdAt: s.updatedAt,
        updatedAt: s.updatedAt,
        createdBy: actorId,
        updatedBy: actorId,
      })),
    );
  }

  private async loadAll(ids: readonly string[]): Promise<Client[]> {
    const found: Client[] = [];
    for (const id of ids) {
      const client = await this.findById(storedId<'Client'>(id));
      if (client) found.push(client);
    }
    return found;
  }

  private async findOneWhere(where: SQL): Promise<Client | undefined> {
    const [row] = await this.db.select().from(clients).where(where).limit(1);
    if (!row) return undefined;

    const channels = await this.db
      .select()
      .from(clientChannels)
      .where(eq(clientChannels.clientId, row.id))
      .orderBy(clientChannels.firstContactAt);
    const phones = await this.db
      .select()
      .from(clientPhones)
      .where(eq(clientPhones.clientId, row.id))
      .orderBy(clientPhones.position);
    const emails = await this.db
      .select()
      .from(clientEmails)
      .where(eq(clientEmails.clientId, row.id))
      .orderBy(clientEmails.id);

    return Client.restore({
      id: storedId<'Client'>(row.id),
      kind: KindSchema.parse(row.kind),
      name: row.name ?? undefined,
      phones: storedPhones(row, phones),
      emails: storedEmails(row, emails),
      clientTypes: ClientTypesSchema.parse(row.clientTypes),
      agentId: row.agentId ?? undefined,
      branchId: row.branchId ?? undefined,
      profile: {
        companyName: row.companyName ?? undefined,
        jobTitle: row.jobTitle ?? undefined,
        website: row.website ?? undefined,
        birthDate: row.birthDate ?? undefined,
        address: row.address ?? undefined,
        country: row.country ?? undefined,
        language: row.language ?? undefined,
        documentType: row.documentType ?? undefined,
        documentNumber: row.documentNumber ?? undefined,
      },
      channels: channels.map((c) => ({
        channel: ChannelSchema.parse(c.channel),
        externalId: c.externalId,
        firstContactAt: c.firstContactAt,
        lastContactAt: c.lastContactAt,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? undefined,
      deletedBy: row.deletedBy ?? undefined,
    });
  }
}

// Los registrados antes de las filas hijas solo tienen el principal en `clients`.

function storedPhones(
  row: typeof clients.$inferSelect,
  phones: readonly (typeof clientPhones.$inferSelect)[],
): ClientSnapshot['phones'] {
  if (phones.length === 0) {
    return row.phoneE164 === null
      ? []
      : [
          {
            kind: 'main',
            phone: storedValue(Phone.create(row.phoneE164)),
            contactHours: undefined,
          },
        ];
  }
  return phones.map((p) => ({
    kind: PhoneKindSchema.parse(p.kind),
    phone: storedValue(Phone.create(p.phoneE164)),
    contactHours: p.contactHours ?? undefined,
  }));
}

function storedEmails(
  row: typeof clients.$inferSelect,
  emails: readonly (typeof clientEmails.$inferSelect)[],
): ClientSnapshot['emails'] {
  if (emails.length === 0) {
    return row.email === null
      ? []
      : [{ kind: 'main', email: storedValue(Email.create(row.email)) }];
  }
  return emails.map((e) => ({
    kind: EmailKindSchema.parse(e.kind),
    email: storedValue(Email.create(e.email)),
  }));
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
