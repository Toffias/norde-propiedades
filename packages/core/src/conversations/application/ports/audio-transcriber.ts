import type { Result } from '../../../shared';

export interface AudioTooLargeError {
  readonly type: 'AudioTooLarge';
}

/**
 * Pasa a texto un audio que mandó un contacto (en WhatsApp, por el ID del archivo en Meta).
 * Un error del canal o del proveedor de transcripción es inesperado: la implementación lanza.
 */
export interface AudioTranscriber {
  transcribe(mediaId: string): Promise<Result<string, AudioTooLargeError>>;
}
