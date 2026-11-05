import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { CompanyLogoKind, FileContent } from '../../contracts';
import type { CompanySettingsReader } from '../ports/company-settings-reader';
import type { FileStorage } from '../ports/file-storage';

export type GetCompanyLogoError = ForbiddenError | { readonly type: 'NotFound' };

/**
 * Un logo de la configuración, para mostrarlo en el panel o en la web. Los de la empresa van en la
 * cabecera y los ve cualquier usuario; el de la marca de agua pide `settings:read`.
 */
export class GetCompanyLogo {
  constructor(
    private readonly deps: {
      readonly settings: CompanySettingsReader;
      readonly storage: FileStorage;
    },
  ) {}

  async execute(
    input: { readonly which: CompanyLogoKind },
    actor: Actor,
  ): Promise<Result<FileContent, GetCompanyLogoError>> {
    if (input.which === 'watermark' && !actor.can('settings:read')) {
      return err({ type: 'Forbidden' });
    }
    const settings = await this.deps.settings.get();
    const key = {
      company: settings.logoKey,
      'company-dark': settings.darkLogoKey,
      watermark: settings.watermark.logoKey,
    }[input.which];
    const stored = key === undefined ? undefined : await this.deps.storage.get(key);
    if (stored === undefined) return err({ type: 'NotFound' });
    return ok({ fileName: 'logo', contentType: stored.contentType, bytes: stored.bytes });
  }
}
