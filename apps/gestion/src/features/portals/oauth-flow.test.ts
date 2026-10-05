import { err, ok } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import {
  completeConnection,
  connectionResultPath,
  decodePendingConnection,
  encodePendingConnection,
  type PendingConnection,
} from './oauth-flow';

const PENDING: PendingConnection = {
  portal: 'mercadolibre_developments',
  state: 'state-1',
  codeVerifier: 'v'.repeat(43),
};

function recordingConnect(result: 'ok' | 'rejected' = 'ok') {
  const calls: unknown[] = [];
  return {
    calls,
    connect: (input: unknown) => {
      calls.push(input);
      return Promise.resolve(
        result === 'ok'
          ? ok({ accountName: 'NORDE' })
          : err({ type: 'PortalAuthorizationRejected' as const, reason: 'invalid_grant' }),
      );
    },
  };
}

describe('pending connection cookie', () => {
  it('round-trips the pending connection', () => {
    expect(decodePendingConnection(encodePendingConnection(PENDING))).toEqual(PENDING);
  });

  it.each([
    undefined,
    'not-base64-json',
    Buffer.from('{"portal":"zonaprop"}').toString('base64url'),
  ])('ignores a missing or invalid cookie (%s)', (value) => {
    expect(decodePendingConnection(value)).toBeUndefined();
  });
});

describe('completeConnection', () => {
  it('connects the portal saved in the cookie with the returned code', async () => {
    const { calls, connect } = recordingConnect();

    const result = await completeConnection({
      params: new URLSearchParams({ code: 'TG-code', state: 'state-1' }),
      pending: PENDING,
      connect,
    });

    expect(result).toEqual({ portal: 'mercadolibre_developments', outcome: 'ok' });
    expect(calls).toEqual([
      {
        portal: 'mercadolibre_developments',
        code: 'TG-code',
        state: 'state-1',
        expectedState: 'state-1',
        codeVerifier: 'v'.repeat(43),
      },
    ]);
  });

  it('cannot validate the state without the cookie', async () => {
    const { calls, connect } = recordingConnect();
    const result = await completeConnection({
      params: new URLSearchParams({ code: 'TG-code', state: 'state-1' }),
      pending: undefined,
      connect,
    });
    expect(result.outcome).toBe('InvalidAuthorizationState');
    expect(calls).toHaveLength(0);
  });

  it('reports that the user did not authorize', async () => {
    const { calls, connect } = recordingConnect();
    const result = await completeConnection({
      params: new URLSearchParams({ error: 'access_denied' }),
      pending: PENDING,
      connect,
    });
    expect(result.outcome).toBe('AuthorizationDenied');
    expect(calls).toHaveLength(0);
  });

  it('requires the code and the state', async () => {
    const { connect } = recordingConnect();
    const result = await completeConnection({
      params: new URLSearchParams({ code: 'TG-code' }),
      pending: PENDING,
      connect,
    });
    expect(result.outcome).toBe('ValidationFailed');
  });

  it('returns the use case error', async () => {
    const { connect } = recordingConnect('rejected');
    const result = await completeConnection({
      params: new URLSearchParams({ code: 'TG-code', state: 'state-1' }),
      pending: PENDING,
      connect,
    });
    expect(result.outcome).toBe('PortalAuthorizationRejected');
  });
});

describe('connectionResultPath', () => {
  it('goes back to Mi empresa → Portales with the outcome', () => {
    expect(connectionResultPath('ok')).toBe('/mi-empresa/portales?conexion=ok');
  });
});
