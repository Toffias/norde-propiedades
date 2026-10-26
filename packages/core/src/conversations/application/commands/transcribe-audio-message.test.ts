import { describe, expect, it } from 'vitest';

import { Actor, err, ok, type Result } from '../../../shared';
import type { AudioTooLargeError, AudioTranscriber } from '../ports/audio-transcriber';

import { TranscribeAudioMessage } from './transcribe-audio-message';

const agent = Actor.system('agent-ia', ['conversations:receive']);

class FakeTranscriber implements AudioTranscriber {
  readonly requested: string[] = [];
  constructor(private readonly result: Result<string, AudioTooLargeError>) {}

  transcribe(mediaId: string) {
    this.requested.push(mediaId);
    return Promise.resolve(this.result);
  }
}

const useCase = (result: Result<string, AudioTooLargeError>) => {
  const transcriber = new FakeTranscriber(result);
  return { transcriber, transcribe: new TranscribeAudioMessage({ transcriber }) };
};

describe('TranscribeAudioMessage', () => {
  it('returns the transcript, with normalized spaces', async () => {
    const { transcriber, transcribe } = useCase(ok('  Hola, busco un depto\n en Palermo  '));

    const result = await transcribe.execute({ mediaId: 'media-1' }, agent);

    expect(result.isOk() && result.value).toEqual({ text: 'Hola, busco un depto en Palermo' });
    expect(transcriber.requested).toEqual(['media-1']);
  });

  it('fails when the audio has no words or is too large', async () => {
    const empty = await useCase(ok('  ')).transcribe.execute({ mediaId: 'm' }, agent);
    expect(empty.isErr() && empty.error).toEqual({ type: 'EmptyTranscript' });

    const large = await useCase(err({ type: 'AudioTooLarge' })).transcribe.execute(
      { mediaId: 'm' },
      agent,
    );
    expect(large.isErr() && large.error).toEqual({ type: 'AudioTooLarge' });
  });

  it('rejects an invalid media id without calling the transcriber', async () => {
    const { transcriber, transcribe } = useCase(ok('hola'));

    const result = await transcribe.execute({ mediaId: ' ' }, agent);

    expect(result.isErr() && result.error.type).toBe('InvalidInput');
    expect(transcriber.requested).toEqual([]);
  });

  it('requires permission to receive conversations', async () => {
    const { transcriber, transcribe } = useCase(ok('hola'));

    const result = await transcribe.execute(
      { mediaId: 'media-1' },
      Actor.system('agent-ia', ['properties:read']),
    );

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
    expect(transcriber.requested).toEqual([]);
  });
});
