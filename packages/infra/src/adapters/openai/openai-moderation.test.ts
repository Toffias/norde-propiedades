import { describe, expect, it } from 'vitest';

import { openAIModeration } from './openai-moderation';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function moderation(response: Response) {
  const errors: unknown[] = [];
  const requests: { url: string; body: unknown }[] = [];
  const moderate = openAIModeration({
    apiKey: 'openai-key',
    onError: (error) => errors.push(error),
    fetch: (input, init) => {
      requests.push({
        url: input instanceof Request ? input.url : input.toString(),
        body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as unknown,
      });
      return Promise.resolve(response);
    },
  });
  return { moderate, errors, requests };
}

describe('openAIModeration', () => {
  it('flags a message that OpenAI flags', async () => {
    const { moderate, requests } = moderation(json({ results: [{ flagged: true }] }));

    expect(await moderate('texto')).toBe(true);
    expect(requests).toEqual([
      {
        url: 'https://api.openai.com/v1/moderations',
        body: { model: 'omni-moderation-latest', input: 'texto' },
      },
    ]);
  });

  it('lets the message through when OpenAI does not flag it', async () => {
    expect(await moderation(json({ results: [{ flagged: false }] })).moderate('hola')).toBe(false);
  });

  it('lets the message through and reports the error when the API fails', async () => {
    const { moderate, errors } = moderation(json({}, 500));

    expect(await moderate('hola')).toBe(false);
    expect(errors).toHaveLength(1);
  });
});
