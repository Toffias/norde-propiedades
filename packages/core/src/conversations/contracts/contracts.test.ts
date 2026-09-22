import { describe, expect, it } from 'vitest';

import { CONVERSATION_CHANNELS } from '../domain/conversation';

import { CONVERSATION_CHANNEL_VALUES } from './index';

describe('conversations contracts', () => {
  it('mirror the domain enums', () => {
    expect(CONVERSATION_CHANNEL_VALUES).toEqual(CONVERSATION_CHANNELS);
  });
});
