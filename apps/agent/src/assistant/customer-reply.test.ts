import { FindPropertyByPortalAd } from '@norde/core/portals';
import { InMemoryPortalAdLookup } from '@norde/core/portals/testing';
import { GetPropertyDetail } from '@norde/core/properties';
import { InMemoryPropertySearchQuery } from '@norde/core/properties/testing';
import { Actor } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { applyCustomerReply } from './customer-reply';
import { createTurnContext } from './turn-context';

const deps = {
  actor: Actor.system('agent-ia', ['properties:read']),
  siteUrl: 'https://norde.com.ar',
  getPropertyDetail: new GetPropertyDetail({ properties: new InMemoryPropertySearchQuery([]) }),
  findPropertyByPortalAd: new FindPropertyByPortalAd({ ads: new InMemoryPortalAdLookup() }),
};

const context = () =>
  createTurnContext({ channel: 'whatsapp', channelExternalId: '549110000', now: new Date() });

describe('applyCustomerReply', () => {
  it('trims the buttons to 3 non-empty titles of up to 20 characters', async () => {
    const turn = context();

    const text = await applyCustomerReply(
      {
        text: '¿Qué preferís?',
        buttons: [' Comprar ', '', 'Una opción demasiado larga', 'Tasar', 'Otra'],
        photoPropertyId: null,
      },
      turn,
      deps,
    );

    expect(text).toBe('¿Qué preferís?');
    expect(turn.buttons).toEqual([
      { id: 'opt_1', title: 'Comprar' },
      { id: 'opt_2', title: 'Una opción demasiado' },
      { id: 'opt_3', title: 'Tasar' },
    ]);
  });

  it('returns no text for an output that does not match the schema', async () => {
    const turn = context();

    expect(await applyCustomerReply({ message: 'hola' }, turn, deps)).toBeUndefined();
    expect(await applyCustomerReply(undefined, turn, deps)).toBeUndefined();
    expect(turn.buttons).toBeUndefined();
  });
});
