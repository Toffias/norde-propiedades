import {
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { ChangeLogoInputSchema, type ChangeLogoInput } from '../../contracts';
import { Watermark, type InvalidWatermarkError } from '../../domain/watermark';
import { companySettingsAuditState, saveCompanySettingsChange } from '../company-settings-changes';
import type { FileStorage } from '../ports/file-storage';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

import { withStoredImage } from '../stored-image';

export type ChangeWatermarkLogoError =
  ForbiddenError | ValidationFailedError | InvalidWatermarkError;

/** Sube el logo de la marca de agua o lo quita (solo con la marca de agua desactivada). */
export class ChangeWatermarkLogo {
  constructor(
    private readonly deps: {
      readonly uow: SettingsUnitOfWork;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ChangeLogoInput,
    actor: Actor,
  ): Promise<Result<void, ChangeWatermarkLogoError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ChangeLogoInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { image } = parsed.value;

    const change = (key: string | undefined) =>
      this.deps.uow.run(async (tx): Promise<Result<void, ChangeWatermarkLogoError>> => {
        const settings = await tx.companySettings.get();
        const before = companySettingsAuditState(settings);
        const watermark = Watermark.create({ ...settings.watermark.toProps(), logoKey: key });
        if (watermark.isErr()) return err(watermark.error);
        settings.configureWatermark(watermark.value, this.deps.clock.now());
        await saveCompanySettingsChange(tx, actor, settings, before);
        return ok(undefined);
      });

    if (image === undefined) return change(undefined);
    return withStoredImage(this.deps, image, 'watermark', change);
  }
}
