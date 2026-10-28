import { describe, expect, it } from 'vitest';

import {
  MAX_QUICK_REPLY_BODY_LENGTH as DOMAIN_MAX_BODY,
  MAX_QUICK_REPLY_NAME_LENGTH as DOMAIN_MAX_NAME,
  MAX_QUICK_REPLY_SUBJECT_LENGTH as DOMAIN_MAX_SUBJECT,
  QUICK_REPLY_VARIABLES,
} from '../domain/quick-reply';

import {
  ListQuickRepliesQuerySchema,
  MAX_QUICK_REPLY_BODY_LENGTH,
  MAX_QUICK_REPLY_NAME_LENGTH,
  MAX_QUICK_REPLY_SUBJECT_LENGTH,
  MAX_SEND_MESSAGE_LENGTH,
  QUICK_REPLY_VARIABLE_LABELS,
} from '.';

describe('quick reply contracts', () => {
  it('mirror the limits and variables of the domain', () => {
    expect(MAX_QUICK_REPLY_NAME_LENGTH).toBe(DOMAIN_MAX_NAME);
    expect(MAX_QUICK_REPLY_SUBJECT_LENGTH).toBe(DOMAIN_MAX_SUBJECT);
    expect(MAX_QUICK_REPLY_BODY_LENGTH).toBe(DOMAIN_MAX_BODY);
    expect(Object.keys(QUICK_REPLY_VARIABLE_LABELS)).toEqual([...QUICK_REPLY_VARIABLES]);
  });

  it('fit a body in the message of a send', () => {
    expect(MAX_QUICK_REPLY_BODY_LENGTH).toBeLessThanOrEqual(MAX_SEND_MESSAGE_LENGTH);
  });

  it('list the active ones by name by default and reject other sorts', () => {
    expect(ListQuickRepliesQuerySchema.parse({})).toMatchObject({
      status: 'active',
      sort: { field: 'name', direction: 'asc' },
    });
    expect(ListQuickRepliesQuerySchema.safeParse({ sort: 'body' }).success).toBe(false);
  });
});
