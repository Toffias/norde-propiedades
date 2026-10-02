import { describe, expect, it } from 'vitest';

import { CLIENT_KINDS, CLIENT_TYPES, EMAIL_KINDS, PHONE_KINDS } from '../domain/client-values';
import { CONTACT_CHANNELS } from '../domain/contact-channel';
import { OPPORTUNITY_INTENTS, OPPORTUNITY_TYPES } from '../domain/opportunity';

import {
  CLIENT_KIND_VALUES,
  CLIENT_TYPE_VALUES,
  ClientFilterSchema,
  CONTACT_CHANNEL_VALUES,
  EMAIL_KIND_VALUES,
  ListClientsQuerySchema,
  PHONE_KIND_VALUES,
  OPPORTUNITY_INTENT_VALUES,
  OPPORTUNITY_TYPE_VALUES,
} from './index';

// Los contracts no pueden importar el dominio (van al cliente de React): replican sus enums.
describe('clients contracts', () => {
  it('mirror the domain enums', () => {
    expect(CONTACT_CHANNEL_VALUES).toEqual(CONTACT_CHANNELS);
    expect(OPPORTUNITY_TYPE_VALUES).toEqual(OPPORTUNITY_TYPES);
    expect(OPPORTUNITY_INTENT_VALUES).toEqual(OPPORTUNITY_INTENTS);
    expect(CLIENT_KIND_VALUES).toEqual(CLIENT_KINDS);
    expect(CLIENT_TYPE_VALUES).toEqual(CLIENT_TYPES);
    expect(PHONE_KIND_VALUES).toEqual(PHONE_KINDS);
    expect(EMAIL_KIND_VALUES).toEqual(EMAIL_KINDS);
  });

  it('reads the contacts list filters from the URL', () => {
    const query = ListClientsQuerySchema.parse({ owners: 'true', sort: '-name', page: '2' });
    expect(query).toMatchObject({
      owners: true,
      view: 'active',
      page: 2,
      sort: { field: 'name', direction: 'desc' },
    });
    expect(ClientFilterSchema.parse({ owners: false }).owners).toBe(false);
  });

  it('rejects an unknown sort and inverted date ranges', () => {
    expect(ListClientsQuerySchema.safeParse({ sort: 'email' }).success).toBe(false);
    expect(
      ClientFilterSchema.safeParse({ createdFrom: '2026-03-02', createdTo: '2026-03-01' }).success,
    ).toBe(false);
  });
});
