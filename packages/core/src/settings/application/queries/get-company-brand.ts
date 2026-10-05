import { ok, type Actor, type Result } from '../../../shared';
import type { CompanyBrandView } from '../../contracts';
import { storageVersion } from '../company-settings-changes';
import type { CompanySettingsReader } from '../ports/company-settings-reader';

/**
 * El nombre y el logo de la empresa, para la cabecera del panel. Los ve cualquier usuario con
 * sesión: no son datos sensibles y no exigen `settings:read`.
 */
export class GetCompanyBrand {
  constructor(private readonly deps: { readonly settings: CompanySettingsReader }) {}

  async execute(
    _input: Record<string, never>,
    _actor: Actor,
  ): Promise<Result<CompanyBrandView, never>> {
    const s = (await this.deps.settings.get()).toSnapshot();
    return ok({ name: s.name, logoVersion: storageVersion(s.logoKey) });
  }
}
