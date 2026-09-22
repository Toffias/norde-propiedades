import { describe, expect, it } from 'vitest';

import { CONTACT_CHANNELS } from '../domain/contact-channel';
import { OPPORTUNITY_INTENTS, OPPORTUNITY_TYPES } from '../domain/opportunity';

import {
  CONTACT_CHANNEL_VALUES,
  OPPORTUNITY_INTENT_VALUES,
  OPPORTUNITY_TYPE_VALUES,
} from './index';

// Los contracts no pueden importar el dominio (van al cliente de React): replican sus enums.
describe('clients contracts', () => {
  it('mirror the domain enums', () => {
    expect(CONTACT_CHANNEL_VALUES).toEqual(CONTACT_CHANNELS);
    expect(OPPORTUNITY_TYPE_VALUES).toEqual(OPPORTUNITY_TYPES);
    expect(OPPORTUNITY_INTENT_VALUES).toEqual(OPPORTUNITY_INTENTS);
  });
});
