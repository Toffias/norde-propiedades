import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileContent } from '../../contracts';
import type { CompanySettingsReader } from '../ports/company-settings-reader';
import type { FileStorage } from '../ports/file-storage';

export type GetCompanyLogoError = ForbiddenError | { readonly type: 'NotFound' };

/**
 * El logo de la empresa o el de la marca de agua, para mostrarlo en el panel. El de la empresa va en
 * la cabecera y lo ve cualquier usuario; el de la marca de agua pide `settings:read`.
 */
export class GetCompanyLogo {
  constructor(
    private readonly deps: {
      readonly settings: CompanySettingsReader;
      readonly storage: FileStorage;
    },
  ) {}

  async execute(
    input: { readonly which: 'company' | 'watermark' },
    actor: Actor,
  ): Promise<Result<FileContent, GetCompanyLogoError>> {
    if (input.which === 'watermark' && !actor.can('settings:read')) {
      return err({ type: 'Forbidden' });
    }
    const settings = await this.deps.settings.get();
    const key = input.which === 'company' ? settings.logoKey : settings.watermark.logoKey;
    const stored = key === undefined ? undefined : await this.deps.storage.get(key);
    if (stored === undefined) return err({ type: 'NotFound' });
    return ok({ fileName: 'logo', contentType: stored.contentType, bytes: stored.bytes });
  }
}
