import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { UpdatePdfOptionsInputSchema, type UpdatePdfOptionsInput } from '../../contracts';
import { companySettingsAuditState, saveCompanySettingsChange } from '../company-settings-changes';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type UpdatePdfOptionsError = ForbiddenError | ValidationFailedError;

/** Qué muestra la ficha y el PDF de una propiedad: contacto, agente, dirección, precio, fotos. */
export class UpdatePdfOptions {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdatePdfOptionsInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePdfOptionsError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(UpdatePdfOptionsInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdatePdfOptionsError>> => {
      const settings = await tx.companySettings.get();
      const before = companySettingsAuditState(settings);
      settings.updatePdfOptions(parsed.value, this.deps.clock.now());
      await saveCompanySettingsChange(tx, actor, settings, before);
      return ok(undefined);
    });
  }
}
