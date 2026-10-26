import { describe, expect, it } from 'vitest';

import { WhatsAppAudioTranscriber } from './whatsapp-audio-transcriber';

interface Call {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly form: FormData | undefined;
}

function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? 'GET',
      authorization: new Headers(init?.headers).get('authorization'),
      form: init?.body instanceof FormData ? init.body : undefined,
    });
    return Promise.resolve(responses.shift() ?? new Response('{}', { status: 500 }));
  };
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const MEDIA = {
  url: 'https://lookaside.example.com/audio?id=1',
  mime_type: 'audio/ogg; codecs=opus',
  file_size: 4,
};

function transcriber(fetchImpl: typeof fetch, maxBytes?: number) {
  return new WhatsAppAudioTranscriber({
    accessToken: 'meta-token',
    apiVersion: 'v23.0',
    baseUrl: 'https://graph.example.com',
    openai: { apiKey: 'openai-key', model: 'gpt-4o-mini-transcribe' },
    fetch: fetchImpl,
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });
}

describe('WhatsAppAudioTranscriber', () => {
  it('downloads the audio from Meta and transcribes it with OpenAI', async () => {
    const { calls, fetchImpl } = fakeFetch([
      json(MEDIA),
      new Response(new Uint8Array([1, 2, 3, 4])),
      json({ text: 'Busco un depto en Palermo' }),
    ]);

    const result = await transcriber(fetchImpl).transcribe('media-1');

    expect(result.isOk() && result.value).toBe('Busco un depto en Palermo');
    expect(calls.map((c) => [c.method, c.url, c.authorization])).toEqual([
      ['GET', 'https://graph.example.com/v23.0/media-1', 'Bearer meta-token'],
      ['GET', MEDIA.url, 'Bearer meta-token'],
      ['POST', 'https://api.openai.com/v1/audio/transcriptions', 'Bearer openai-key'],
    ]);
    const form = calls[2]?.form;
    expect(form?.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form?.get('language')).toBe('es');
    const file = form?.get('file');
    expect(file instanceof File && file.name).toBe('audio.ogg');
  });

  it('refuses audios larger than the limit without downloading them', async () => {
    const { calls, fetchImpl } = fakeFetch([json({ ...MEDIA, file_size: 10 })]);

    const result = await transcriber(fetchImpl, 5).transcribe('media-1');

    expect(result.isErr() && result.error).toEqual({ type: 'AudioTooLarge' });
    expect(calls).toHaveLength(1);
  });

  it('throws when an API fails', async () => {
    const { fetchImpl } = fakeFetch([
      json(MEDIA),
      new Response(new Uint8Array([1])),
      json({}, 429),
    ]);

    await expect(transcriber(fetchImpl).transcribe('media-1')).rejects.toThrow(
      'OpenAI transcription responded 429',
    );
  });
});
