import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  TranscribeAudioMessageInputSchema,
  type TranscribeAudioMessageInput,
} from '../../contracts';
import type { AudioTooLargeError, AudioTranscriber } from '../ports/audio-transcriber';

export type TranscribeAudioMessageError =
  | ForbiddenError
  | AudioTooLargeError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  /** El audio no tenía palabras (silencio, ruido). */
  | { readonly type: 'EmptyTranscript' };

/** Tope del texto de un audio: el mismo orden que el de un mensaje escrito largo. */
const MAX_TRANSCRIPT_CHARS = 4000;

/**
 * Pasa a texto un audio de un contacto, para que el agente lo lea como un mensaje escrito. No
 * guarda nada: el texto se registra después con `ReceiveInboundMessages`, como un mensaje `audio`.
 */
export class TranscribeAudioMessage {
  constructor(private readonly deps: { readonly transcriber: AudioTranscriber }) {}

  async execute(
    input: TranscribeAudioMessageInput,
    actor: Actor,
  ): Promise<Result<{ readonly text: string }, TranscribeAudioMessageError>> {
    if (!actor.can('conversations:receive')) return err({ type: 'Forbidden' });

    const parsed = TranscribeAudioMessageInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }

    const transcript = await this.deps.transcriber.transcribe(parsed.data.mediaId);
    if (transcript.isErr()) return err(transcript.error);

    const text = transcript.value.replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSCRIPT_CHARS);
    return text === '' ? err({ type: 'EmptyTranscript' }) : ok({ text });
  }
}
