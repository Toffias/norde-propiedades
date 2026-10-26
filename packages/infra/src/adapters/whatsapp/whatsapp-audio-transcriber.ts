import type { AudioTooLargeError, AudioTranscriber } from '@norde/core/conversations';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

/** Una nota de voz de un par de minutos pesa menos de 1 MB; más que esto es un audio largo. */
export const DEFAULT_MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const MediaSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  mime_type: z.string().min(1),
  file_size: z.number().int().nonnegative().optional(),
});

const TranscriptionSchema = z.object({ text: z.string() });

export interface WhatsAppAudioTranscriberOptions {
  /** El mismo token de System User del canal: Meta lo pide para descargar el archivo. */
  readonly accessToken: string;
  readonly apiVersion: string;
  /** Graph API de Meta (en tests locales, un mock). */
  readonly baseUrl: string;
  readonly openai: {
    readonly apiKey: string;
    /** Ej. `gpt-4o-mini-transcribe`. */
    readonly model: string;
    readonly baseUrl?: string;
  };
  readonly maxBytes?: number;
  readonly fetch?: typeof fetch;
}

const TIMEOUT_MS = 30_000;

/**
 * Transcribe los audios de WhatsApp: descarga el archivo de Meta y lo manda a la API de
 * transcripción de OpenAI, sin SDK. Un error de cualquiera de las dos APIs lanza.
 */
export class WhatsAppAudioTranscriber implements AudioTranscriber {
  readonly #fetch: typeof fetch;
  readonly #maxBytes: number;

  constructor(private readonly options: WhatsAppAudioTranscriberOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_AUDIO_BYTES;
  }

  async transcribe(mediaId: string): Promise<Result<string, AudioTooLargeError>> {
    const { baseUrl, apiVersion } = this.options;
    const media = MediaSchema.parse(
      await this.json(
        `${baseUrl}/${apiVersion}/${encodeURIComponent(mediaId)}`,
        { headers: this.metaHeaders() },
        'WhatsApp media lookup',
      ),
    );
    if (media.file_size !== undefined && media.file_size > this.#maxBytes) {
      return err({ type: 'AudioTooLarge' });
    }

    const download = await this.#fetch(media.url, {
      headers: this.metaHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!download.ok) throw new Error(`WhatsApp media download responded ${download.status}`);
    const audio = await download.arrayBuffer();
    if (audio.byteLength > this.#maxBytes) return err({ type: 'AudioTooLarge' });

    const form = new FormData();
    form.append('file', new Blob([audio], { type: media.mime_type }), fileName(media.mime_type));
    form.append('model', this.options.openai.model);
    form.append('language', 'es');
    form.append('response_format', 'json');
    const transcription = TranscriptionSchema.parse(
      await this.json(
        `${this.options.openai.baseUrl ?? 'https://api.openai.com/v1'}/audio/transcriptions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.options.openai.apiKey}` },
          body: form,
        },
        'OpenAI transcription',
      ),
    );
    return ok(transcription.text);
  }

  private metaHeaders() {
    return { Authorization: `Bearer ${this.options.accessToken}` };
  }

  private async json(url: string, init: RequestInit, what: string): Promise<unknown> {
    const response = await this.#fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${what} responded ${response.status}`);
    return response.json();
  }
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'audio/amr': 'amr',
};

/** OpenAI deduce el formato por la extensión. Las notas de voz de WhatsApp son OGG/Opus. */
function fileName(mimeType: string): string {
  const type = mimeType.split(';')[0]?.trim() ?? '';
  return `audio.${EXTENSIONS[type] ?? 'ogg'}`;
}
