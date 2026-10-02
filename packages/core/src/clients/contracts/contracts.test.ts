import { describe, expect, it } from 'vitest';

import { MAX_ERASED_CLIENT_IDS } from '../../shared';
import { CLIENT_ACTIVITY_KINDS, MAX_NOTE_LENGTH } from '../domain/client-activity';
import { ERASURE_CONFIRMATION_WORD, MAX_ERASED_MERGED_CLIENTS } from '../domain/client-erasure';
import { CLIENT_RELATION_KINDS } from '../domain/client-relation';
import { MAX_CLIENT_TAGS } from '../domain/client-tag';
import { CLIENT_KINDS, CLIENT_TYPES, EMAIL_KINDS, PHONE_KINDS } from '../domain/client-values';
import { CONTACT_CHANNELS } from '../domain/contact-channel';
import { OPPORTUNITY_INTENTS, OPPORTUNITY_TYPES } from '../domain/opportunity';
import { OPPORTUNITY_STATUSES } from '../domain/opportunity-status';

import {
  CLIENT_ACTIVITY_KIND_VALUES,
  CLIENT_KIND_VALUES,
  CLIENT_RELATION_KIND_VALUES,
  CLIENT_TYPE_VALUES,
  ClientFilterSchema,
  CONTACT_CHANNEL_VALUES,
  EMAIL_KIND_VALUES,
  ERASURE_CONFIRMATION_WORD as CONTRACT_ERASURE_WORD,
  ListClientActivityQuerySchema,
  ListClientsQuerySchema,
  MAX_CLIENT_NOTE_LENGTH,
  MAX_TAGS_PER_CLIENT,
  OPPORTUNITY_STATUS_VALUES,
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
    expect(CLIENT_RELATION_KIND_VALUES).toEqual(CLIENT_RELATION_KINDS);
    expect(MAX_TAGS_PER_CLIENT).toBe(MAX_CLIENT_TAGS);
    expect(OPPORTUNITY_STATUS_VALUES).toEqual(OPPORTUNITY_STATUSES);
    expect(CLIENT_ACTIVITY_KIND_VALUES).toEqual(CLIENT_ACTIVITY_KINDS);
    expect(MAX_CLIENT_NOTE_LENGTH).toBe(MAX_NOTE_LENGTH);
    expect(CONTRACT_ERASURE_WORD).toBe(ERASURE_CONFIRMATION_WORD);
    // El contacto suprimido más sus duplicados unificados.
    expect(MAX_ERASED_CLIENT_IDS).toBe(MAX_ERASED_MERGED_CLIENTS + 1);
  });

  it('reads the activity filters from the URL', () => {
    const clientId = '00000000-0000-7000-8000-0000000000d1';
    expect(ListClientActivityQuerySchema.parse({ clientId, kind: 'note' })).toMatchObject({
      kind: 'note',
      sort: { field: 'occurredAt', direction: 'desc' },
    });
    expect(ListClientActivityQuerySchema.safeParse({ clientId, kind: 'email' }).success).toBe(
      false,
    );
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
