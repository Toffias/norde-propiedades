import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { RecordingMailer, InMemoryCompanySettingsRepository } from '../../../settings/testing';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  FakeSharedListingEmails,
  FakeSharedListingTokens,
  InMemoryClientAgents,
  InMemoryClientListings,
  InMemoryClientsUnitOfWork,
  InMemoryPublicListings,
  OTHER_BRANCH_ID,
  OTHER_PROPERTY_ID,
  PROPERTY_ID,
  seedClient,
  seedOpportunity,
  stageFixtureId,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
} from '../../testing';
import { NO_RULES } from '../../domain/opportunity-settings';
import { firstNameOf } from '../../domain/quick-reply';
import type { ClientSendItem, ClientSendsQuery } from '../ports/shared-listing-ports';
import { ApplyOpportunityRules } from '../handlers/apply-opportunity-rules';
import { GetSharedListing } from '../queries/get-shared-listing';
import { ListClientSends } from '../queries/list-client-sends';

import { OpenSharedListing, ReactToSharedListing } from './respond-to-shared-listing';
import { RevokeSharedListing } from './revoke-shared-listing';
import { SendListings } from './send-listings';

const SITE = 'https://norde.com.ar';
/** El agente del contacto, que también ve la cartera. */
const TEST_AGENT = Actor.user(AGENT_ID, [
  'clients:read',
  'clients:update',
  'properties:read',
]).withBranch(BRANCH_ID);
const WEB = Actor.system('web', ['clients:respond-to-listings']);
const DAY = 24 * 60 * 60 * 1000;

class StubClientSendsQuery implements ClientSendsQuery {
  items: readonly ClientSendItem[] = [];

  sends() {
    return Promise.resolve({ items: this.items, total: this.items.length });
  }
}

async function setup(options: { readonly siteUrl?: string | undefined } = {}) {
  const uow = new InMemoryClientsUnitOfWork();
  const client = await seedClient(uow, { emails: ['ana@example.com', 'ana.trabajo@example.com'] });
  const clock = new FixedClock('2026-03-01T12:00:00Z');
  const ids = new SequentialIdGenerator();
  const listings = new InMemoryClientListings();
  const publicListings = new InMemoryPublicListings();
  const tokens = new FakeSharedListingTokens();
  const emails = new FakeSharedListingEmails();
  const mailer = new RecordingMailer();
  const settings = new InMemoryCompanySettingsRepository();
  const agents = new InMemoryClientAgents();
  const sendsQuery = new StubClientSendsQuery();
  const deps = { uow, tokens, ids, clock };
  return {
    uow,
    client,
    clock,
    listings,
    publicListings,
    tokens,
    emails,
    mailer,
    sendsQuery,
    send: new SendListings({
      uow,
      listings,
      publicListings,
      tokens,
      emails,
      mailer,
      settings,
      agents,
      siteUrl: 'siteUrl' in options ? options.siteUrl : SITE,
      ids,
      clock,
    }),
    revoke: new RevokeSharedListing({ uow, clock }),
    open: new OpenSharedListing(deps),
    react: new ReactToSharedListing(deps),
    get: new GetSharedListing({ uow, tokens, agents, clock }),
    list: new ListClientSends({ uow, sends: sendsQuery, listings, agents, clock }),
  };
}

/** El token que recibió el cliente: el del link que devolvió el envío. */
function tokenOf(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}

describe('SendListings', () => {
  it('emails the link, records the send in the activity and audits it', async () => {
    const { uow, client, send, mailer, emails } = await setup();
    const opportunity = await seedOpportunity(uow, client);

    const output = unwrap(
      await send.execute(
        {
          clientId: client.id,
          propertyIds: [PROPERTY_ID, OTHER_PROPERTY_ID],
          channel: 'email',
          recipient: 'ANA.trabajo@example.com',
          message: 'Mirá estas',
        },
        TEST_AGENT,
      ),
    );

    expect(output.url).toMatch(/^https:\/\/norde\.com\.ar\/e\/[A-Za-z0-9_-]{43}$/);
    expect(output.whatsappUrl).toBeUndefined();
    expect(mailer.sent.map((email) => email.to)).toEqual(['ana.trabajo@example.com']);
    expect(mailer.sent[0]?.html).toContain(output.url);
    expect(emails.composed[0]).toMatchObject({
      advisorName: 'Camila',
      message: 'Mirá estas',
      url: output.url,
      listings: [{ code: 'NOR-001' }, { code: 'NOR-002' }],
    });
    const stored = [...uow.sharedListings.rows.values()];
    expect(stored).toMatchObject([
      {
        clientId: client.id,
        opportunityId: opportunity.id,
        channel: 'email',
        sentBy: TEST_AGENT.id,
      },
    ]);
    // Solo el hash del token queda guardado.
    expect(stored[0]?.tokenHash).toBe(`hash:${tokenOf(output.url)}`);
    expect(uow.activities.of(client.id)).toMatchObject([
      {
        opportunityId: opportunity.id,
        body: {
          kind: 'listing_sent',
          channel: 'email',
          propertyIds: [PROPERTY_ID, OTHER_PROPERTY_ID],
        },
      },
    ]);
    expect(uow.events.published).toMatchObject([
      { type: 'clients.listings_sent', payload: { opportunityId: opportunity.id } },
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'client.listings_sent',
        clientIds: [client.id],
        changes: {
          sharedListingId: { before: null, after: output.sharedListingId },
          channel: { before: null, after: 'email' },
          propertyIds: { before: null, after: [PROPERTY_ID, OTHER_PROPERTY_ID] },
          opportunityId: { before: null, after: opportunity.id },
        },
      }),
    ]);
    // El destinatario no queda en el historial.
    expect(JSON.stringify(uow.audit.entries)).not.toContain('example.com');
  });

  it('returns a wa.me link with the message and the link for WhatsApp, without emailing', async () => {
    const { client, send, mailer } = await setup();

    const output = unwrap(
      await send.execute(
        {
          clientId: client.id,
          propertyIds: [PROPERTY_ID],
          channel: 'whatsapp',
          message: 'Hola Ana',
        },
        TEST_AGENT,
      ),
    );

    expect(output.whatsappUrl).toBe(
      `https://wa.me/5491166899124?text=${encodeURIComponent(`Hola Ana\n\n${output.url}`)}`,
    );
    expect(mailer.sent).toHaveLength(0);
  });

  it('fills the quick reply variables in the subject and the message', async () => {
    const { client, send, emails } = await setup();

    unwrap(
      await send.execute(
        {
          clientId: client.id,
          propertyIds: [PROPERTY_ID],
          channel: 'email',
          subject: '[[primer_nombre_contacto]], de [[nombre_empresa]]',
          message: 'Hola [[nombre_contacto]], soy [[nombre_asesor]]. [[otra]]',
        },
        TEST_AGENT,
      ),
    );

    expect(emails.composed[0]).toMatchObject({
      subject: `${firstNameOf(client.name) ?? ''}, de Norde Propiedades`,
      message: `Hola ${client.name ?? ''}, soy Camila. [[otra]]`,
    });
  });

  it('fills the variables in the WhatsApp message too', async () => {
    const { client, send } = await setup();

    const output = unwrap(
      await send.execute(
        {
          clientId: client.id,
          propertyIds: [PROPERTY_ID],
          channel: 'whatsapp',
          message: 'Hola [[primer_nombre_contacto]]',
        },
        TEST_AGENT,
      ),
    );

    expect(decodeURIComponent(output.whatsappUrl ?? '')).toContain(
      `Hola ${firstNameOf(client.name) ?? ''}\n\n`,
    );
  });

  it('leaves nothing behind when the email does not go out', async () => {
    const { uow, client, send, mailer } = await setup();
    mailer.failWith = { type: 'MailUnavailable' };

    expect(
      unwrapErr(
        await send.execute(
          { clientId: client.id, propertyIds: [PROPERTY_ID], channel: 'email' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'MailUnavailable' });
    expect(uow.sharedListings.rows.size).toBe(0);
    expect(uow.activities.of(client.id)).toHaveLength(0);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('rejects properties the site does not show, unknown ones and missing recipients', async () => {
    const { uow, client, send, publicListings } = await setup();
    const noEmail = await seedClient(uow, { name: 'Sin email' });
    const input = { clientId: client.id, propertyIds: [PROPERTY_ID], channel: 'email' as const };

    publicListings.hidden = [PROPERTY_ID];
    expect(unwrapErr(await send.execute(input, TEST_AGENT))).toEqual({
      type: 'ListingNotPublic',
      codes: ['NOR-001'],
    });
    publicListings.hidden = [];
    expect(
      unwrapErr(
        await send.execute(
          { ...input, propertyIds: ['00000000-0000-7000-8000-0000000000ff'] },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'ListingNotFound' });
    expect(unwrapErr(await send.execute({ ...input, clientId: noEmail.id }, TEST_AGENT))).toEqual({
      type: 'NoRecipient',
      channel: 'email',
    });
    expect(
      unwrapErr(await send.execute({ ...input, recipient: 'otra@example.com' }, TEST_AGENT)),
    ).toEqual({ type: 'NoRecipient', channel: 'email' });
    expect(uow.sharedListings.rows.size).toBe(0);
  });

  it('needs the site URL and permission over the contact', async () => {
    const input = { propertyIds: [PROPERTY_ID], channel: 'email' as const };
    const unconfigured = await setup({ siteUrl: undefined });
    expect(
      unwrapErr(
        await unconfigured.send.execute({ ...input, clientId: unconfigured.client.id }, TEST_AGENT),
      ),
    ).toEqual({ type: 'SendingNotConfigured' });

    const { client, send } = await setup();
    expect(unwrapErr(await send.execute({ ...input, clientId: client.id }, TEST_OUTSIDER))).toEqual(
      { type: 'Forbidden' },
    );
    expect(
      unwrapErr(
        await send.execute(
          { ...input, clientId: client.id },
          Actor.user(TEST_OTHER_AGENT.id, ['clients:update', 'properties:read']).withBranch(
            OTHER_BRANCH_ID,
          ),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('the public page of a send', () => {
  async function sent() {
    const base = await setup();
    const output = unwrap(
      await base.send.execute(
        {
          clientId: base.client.id,
          propertyIds: [PROPERTY_ID, OTHER_PROPERTY_ID],
          channel: 'whatsapp',
        },
        TEST_AGENT,
      ),
    );
    base.uow.events.published.length = 0;
    base.uow.audit.entries.length = 0;
    return { ...base, output, token: tokenOf(output.url) };
  }

  it('shows the properties and the advisor, nothing about the client', async () => {
    const { get, token } = await sent();

    expect(unwrap(await get.execute({ token }, WEB))).toEqual({
      expiresAt: new Date('2026-05-30T12:00:00Z'),
      advisorName: 'Camila',
      items: [
        { propertyId: PROPERTY_ID, reaction: undefined },
        { propertyId: OTHER_PROPERTY_ID, reaction: undefined },
      ],
    });
    expect(unwrapErr(await get.execute({ token: 'x'.repeat(43) }, WEB))).toEqual({
      type: 'SharedListingNotFound',
    });
    expect(unwrapErr(await get.execute({ token: '../../etc' }, WEB))).toEqual({
      type: 'SharedListingNotFound',
    });
    expect(unwrapErr(await get.execute({ token }, TEST_AGENT))).toEqual({ type: 'Forbidden' });
  });

  it('records the first open in the activity and audit, and only counts the next ones', async () => {
    const { uow, client, open, token } = await sent();

    unwrap(await open.execute({ token }, WEB));
    unwrap(await open.execute({ token }, WEB));

    expect([...uow.sharedListings.rows.values()][0]?.items[0]?.openCount).toBe(2);
    expect(uow.activities.of(client.id).filter((a) => a.body.kind === 'listing_viewed')).toEqual([
      expect.objectContaining({ actorId: 'system:web' }),
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({ action: 'client.listing_send_opened', clientIds: [client.id] }),
    ]);
    expect(unwrapErr(await open.execute({ token }, TEST_AGENT))).toEqual({ type: 'Forbidden' });
  });

  it('records each reaction change with an event for the rules', async () => {
    const { uow, client, react, token } = await sent();

    unwrap(await react.execute({ token, propertyId: PROPERTY_ID, reaction: 'liked' }, WEB));
    unwrap(await react.execute({ token, propertyId: PROPERTY_ID, reaction: 'liked' }, WEB));
    unwrap(await react.execute({ token, propertyId: PROPERTY_ID, reaction: 'disliked' }, WEB));

    expect(
      uow.activities.of(client.id).filter((a) => a.body.kind === 'listing_reaction'),
    ).toHaveLength(2);
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'clients.listing_reacted',
      'clients.listing_reacted',
    ]);
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'client.listing_reacted',
      changes: { reaction: { before: 'liked', after: 'disliked' } },
    });
    expect(
      unwrapErr(
        await react.execute(
          { token, propertyId: '00000000-0000-7000-8000-0000000000ff', reaction: 'liked' },
          WEB,
        ),
      ),
    ).toEqual({ type: 'ListingNotInSend' });
  });

  it('stops working once revoked or expired', async () => {
    const { client, revoke, open, react, get, clock, output, token, uow } = await sent();

    clock.advance(90 * DAY);
    expect(unwrapErr(await get.execute({ token }, WEB))).toEqual({
      type: 'SharedListingUnavailable',
      reason: 'expired',
    });

    const fresh = await sent();
    unwrap(
      await fresh.revoke.execute(
        { clientId: fresh.client.id, sharedListingId: fresh.output.sharedListingId },
        TEST_AGENT,
      ),
    );
    expect(unwrapErr(await fresh.open.execute({ token: fresh.token }, WEB))).toEqual({
      type: 'SharedListingUnavailable',
      reason: 'revoked',
    });
    expect(
      unwrapErr(
        await fresh.react.execute(
          { token: fresh.token, propertyId: PROPERTY_ID, reaction: 'liked' },
          WEB,
        ),
      ),
    ).toEqual({ type: 'SharedListingUnavailable', reason: 'revoked' });
    expect(fresh.uow.audit.entries).toEqual([
      expect.objectContaining({ action: 'client.listing_send_revoked' }),
    ]);

    // Revocar dos veces no audita de nuevo; otro agente no puede.
    unwrap(
      await fresh.revoke.execute(
        { clientId: fresh.client.id, sharedListingId: fresh.output.sharedListingId },
        TEST_AGENT,
      ),
    );
    expect(fresh.uow.audit.entries).toHaveLength(1);
    expect(
      unwrapErr(
        await revoke.execute(
          { clientId: client.id, sharedListingId: output.sharedListingId },
          TEST_OTHER_AGENT,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    const other = await seedClient(uow, { name: 'Otro' });
    expect(
      unwrapErr(
        await revoke.execute(
          { clientId: other.id, sharedListingId: output.sharedListingId },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'SharedListingNotFound' });
    expect(
      unwrapErr(await react.execute({ token, propertyId: PROPERTY_ID, reaction: 'liked' }, WEB)),
    ).toEqual({
      type: 'SharedListingUnavailable',
      reason: 'expired',
    });
    expect(unwrapErr(await open.execute({ token }, WEB))).toMatchObject({
      type: 'SharedListingUnavailable',
    });
  });
});

describe('ListClientSends', () => {
  it('lists the sends with their status, property codes and who sent them', async () => {
    const { client, list, sendsQuery } = await setup();
    const base: ClientSendItem = {
      id: 'send-1',
      channel: 'email',
      sentAt: new Date('2026-02-01T12:00:00Z'),
      sentBy: TEST_AGENT.id,
      expiresAt: new Date('2026-05-01T12:00:00Z'),
      revokedAt: undefined,
      properties: [{ id: PROPERTY_ID, reaction: 'liked' }],
      firstOpenedAt: undefined,
      openCount: 0,
    };
    sendsQuery.items = [
      base,
      { ...base, id: 'send-2', expiresAt: new Date('2026-02-15T12:00:00Z') },
      { ...base, id: 'send-3', revokedAt: new Date('2026-02-02T12:00:00Z') },
    ];

    const page = unwrap(await list.execute({ clientId: client.id }, TEST_AGENT));

    expect(page.items.map((row) => [row.status, row.can.revoke])).toEqual([
      ['available', true],
      ['expired', false],
      ['revoked', false],
    ]);
    expect(page.items[0]).toMatchObject({
      sentBy: { name: 'Camila' },
      properties: [{ id: PROPERTY_ID, code: 'NOR-001', reaction: 'liked' }],
    });
    expect(unwrapErr(await list.execute({ clientId: client.id }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('the send and reaction rules', () => {
  it('move the opportunity of the send once per event', async () => {
    const uow = new InMemoryClientsUnitOfWork();
    uow.opportunitySettings.rules = {
      ...NO_RULES,
      afterMessage: stageFixtureId(1),
      afterLike: stageFixtureId(2),
    };
    const apply = new ApplyOpportunityRules({
      uow,
      ids: new SequentialIdGenerator(),
      clock: new FixedClock('2026-03-01T12:00:00Z'),
    });
    const jobs = Actor.system('scheduler', ['opportunities:apply-rules']);
    const client = await seedClient(uow);
    const opportunity = await seedOpportunity(uow, client);

    const sentEvent = {
      eventId: '00000000-0000-7000-8000-0000000000d1',
      opportunityId: opportunity.id,
      trigger: { kind: 'listings_sent' as const },
    };
    expect(unwrap(await apply.execute(sentEvent, jobs))).toEqual({
      applied: true,
      rule: 'afterMessage',
    });
    expect(unwrap(await apply.execute(sentEvent, jobs))).toEqual({
      applied: false,
      reason: 'already_applied',
    });
    expect(
      unwrap(
        await apply.execute(
          {
            eventId: '00000000-0000-7000-8000-0000000000d2',
            opportunityId: opportunity.id,
            trigger: { kind: 'listing_reacted', reaction: 'liked' },
          },
          jobs,
        ),
      ),
    ).toEqual({ applied: true, rule: 'afterLike' });
    expect(
      unwrap(
        await apply.execute(
          {
            eventId: '00000000-0000-7000-8000-0000000000d3',
            opportunityId: opportunity.id,
            trigger: { kind: 'listing_reacted', reaction: 'disliked' },
          },
          jobs,
        ),
      ),
    ).toEqual({ applied: false, reason: 'no_rule' });
    expect(uow.opportunities.rows.get(opportunity.id)?.stageId).toBe(stageFixtureId(2));
  });
});
