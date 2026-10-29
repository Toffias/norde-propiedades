import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { UpdatePdfOptionsInputSchema, type UpdatePdfOptionsInput } from '../../contracts';
import { companySettingsAuditState, saveCompanySettingsChange } from '../company-settings-changes';
import { brandColor, type BrandColorTooLightError } from '../../domain/pdf-options';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type UpdatePdfOptionsError =
  ForbiddenError | ValidationFailedError | BrandColorTooLightError;

/**
 * Qué muestran la ficha y los PDF: contacto (de la sucursal o en texto libre), agente, dirección,
 * precio, fotos y el color de marca.
 */
export class UpdatePdfOptions {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdatePdfOptionsInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePdfOptionsError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(UpdatePdfOptionsInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const color = brandColor(parsed.value.brandColor);
    if (color.isErr()) return err(color.error);

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdatePdfOptionsError>> => {
      const settings = await tx.companySettings.get();
      const before = companySettingsAuditState(settings);
      settings.updatePdfOptions(
        { ...parsed.value, brandColor: color.value },
        this.deps.clock.now(),
      );
      await saveCompanySettingsChange(tx, actor, settings, before);
      return ok(undefined);
    });
  }
}
