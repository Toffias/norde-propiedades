import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { CompanySettingsView } from '../../contracts';
import { toCompanySettingsView } from '../company-settings-changes';
import type { CompanySettingsReader } from '../ports/company-settings-reader';

export type GetCompanySettingsError = ForbiddenError;

/** La configuración de la empresa, para las pantallas de "Mi empresa". */
export class GetCompanySettings {
  constructor(private readonly deps: { readonly settings: CompanySettingsReader }) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<CompanySettingsView, GetCompanySettingsError>> {
    if (!actor.can('settings:read')) return err({ type: 'Forbidden' });
    return ok(toCompanySettingsView(await this.deps.settings.get()));
  }
}
