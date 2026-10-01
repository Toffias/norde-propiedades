import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { ConfigureWatermarkInputSchema, type ConfigureWatermarkInput } from '../../contracts';
import { Watermark, type InvalidWatermarkError } from '../../domain/watermark';
import { companySettingsAuditState, saveCompanySettingsChange } from '../company-settings-changes';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type ConfigureWatermarkError =
  ForbiddenError | ValidationFailedError | InvalidWatermarkError;

/** Activa o desactiva la marca de agua y cambia su tamaño, posición y opacidad. */
export class ConfigureWatermark {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: ConfigureWatermarkInput,
    actor: Actor,
  ): Promise<Result<void, ConfigureWatermarkError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ConfigureWatermarkInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);

    return this.deps.uow.run(async (tx): Promise<Result<void, ConfigureWatermarkError>> => {
      const settings = await tx.companySettings.get();
      const before = companySettingsAuditState(settings);
      const watermark = Watermark.create({ ...parsed.value, logoKey: settings.watermark.logoKey });
      if (watermark.isErr()) return err(watermark.error);
      settings.configureWatermark(watermark.value, this.deps.clock.now());
      await saveCompanySettingsChange(tx, actor, settings, before);
      return ok(undefined);
    });
  }
}
