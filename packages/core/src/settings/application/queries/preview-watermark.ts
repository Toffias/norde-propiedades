import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  PreviewWatermarkInputSchema,
  type FileContent,
  type PreviewWatermarkInput,
} from '../../contracts';
import { Watermark, type InvalidWatermarkError } from '../../domain/watermark';
import type { CompanySettingsReader } from '../ports/company-settings-reader';
import type { FileStorage } from '../ports/file-storage';
import type { ImageWatermarker, InvalidImageError } from '../ports/image-watermarker';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type PreviewWatermarkError =
  ForbiddenError | ValidationFailedError | InvalidWatermarkError | InvalidImageError;

/**
 * Aplica la marca de agua, con las opciones que se están editando (todavía sin guardar), sobre una
 * foto de muestra. No guarda nada.
 */
export class PreviewWatermark {
  constructor(
    private readonly deps: {
      readonly settings: CompanySettingsReader;
      readonly storage: FileStorage;
      readonly watermarker: ImageWatermarker;
    },
  ) {}

  async execute(
    input: PreviewWatermarkInput,
    actor: Actor,
  ): Promise<Result<FileContent, PreviewWatermarkError>> {
    if (!actor.can('settings:read')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PreviewWatermarkInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { photo, options } = parsed.value;

    const settings = await this.deps.settings.get();
    const logoKey = settings.watermark.logoKey;
    // La vista previa siempre muestra la marca: si está activada se valida al guardar.
    const watermark = Watermark.create({ ...options, enabled: true, logoKey });
    if (watermark.isErr()) return err(watermark.error);
    const logo = logoKey === undefined ? undefined : await this.deps.storage.get(logoKey);
    if (logo === undefined) return err({ type: 'WatermarkLogoRequired' });

    const result = await this.deps.watermarker.apply({
      photo: photo.bytes,
      logo: logo.bytes,
      watermark: watermark.value,
    });
    if (result.isErr()) return err(result.error);
    return ok({ fileName: 'vista-previa.jpg', contentType: 'image/jpeg', bytes: result.value });
  }
}
