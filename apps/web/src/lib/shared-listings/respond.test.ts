import { describe, expect, it } from 'vitest';

import { createSharedListingResponses, type SharedListingResponder } from './respond';

const TOKEN = 'a'.repeat(43);
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';

function setup(options: { readonly allow?: boolean; readonly ok?: boolean } = {}) {
  const calls: unknown[] = [];
  const responder: SharedListingResponder = {
    open: (input) => {
      calls.push(['open', input]);
      return Promise.resolve({ isOk: () => options.ok ?? true });
    },
    react: (input) => {
      calls.push(['react', input]);
      return Promise.resolve({ isOk: () => options.ok ?? true });
    },
  };
  const allow = () => options.allow ?? true;
  const responses = createSharedListingResponses({
    responder: () => responder,
    allowOpen: allow,
    allowReact: allow,
  });
  return { responses, calls };
}

describe('shared listing responses', () => {
  it('opens and reacts with a valid token', async () => {
    const { responses, calls } = setup();

    expect(await responses.open({ token: TOKEN }, '1.1.1.1')).toEqual({ ok: true });
    expect(
      await responses.react({ token: TOKEN, propertyId: PROPERTY, reaction: 'liked' }, '1.1.1.1'),
    ).toEqual({ ok: true });
    expect(calls).toEqual([
      ['open', { token: TOKEN }],
      ['react', { token: TOKEN, propertyId: PROPERTY, reaction: 'liked' }],
    ]);
  });

  it('rejects malformed input before reaching the use case', async () => {
    const { responses, calls } = setup();

    expect(await responses.open({ token: 'corto' }, '1.1.1.1')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(
      await responses.react({ token: TOKEN, propertyId: PROPERTY, reaction: 'love' }, '1.1.1.1'),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(await responses.react('nada', '1.1.1.1')).toEqual({ ok: false, reason: 'invalid' });
    expect(calls).toHaveLength(0);
  });

  it('stops an IP over the limit', async () => {
    const { responses, calls } = setup({ allow: false });

    expect(await responses.open({ token: TOKEN }, '1.1.1.1')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    expect(calls).toHaveLength(0);
  });

  it('reports an expired, revoked or unknown link without details', async () => {
    const { responses } = setup({ ok: false });

    expect(await responses.open({ token: TOKEN }, '1.1.1.1')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});
