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
import { companySettingsAuditState, saveCompanySettingsChange } from '../company-settings-changes';
import type { FileStorage } from '../ports/file-storage';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

import { withStoredImage } from '../stored-image';

export type ChangeCompanyLogoError = ForbiddenError | ValidationFailedError;

/** Sube el logo de la empresa (PDF, emails, panel) o lo quita. */
export class ChangeCompanyLogo {
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
  ): Promise<Result<void, ChangeCompanyLogoError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ChangeLogoInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { image } = parsed.value;

    const change = (key: string | undefined) =>
      this.deps.uow.run(async (tx): Promise<Result<void, ChangeCompanyLogoError>> => {
        const settings = await tx.companySettings.get();
        const before = companySettingsAuditState(settings);
        settings.changeLogo(key, this.deps.clock.now());
        await saveCompanySettingsChange(tx, actor, settings, before);
        return ok(undefined);
      });

    if (image === undefined) return change(undefined);
    return withStoredImage(this.deps, image, 'logo', change);
  }
}
