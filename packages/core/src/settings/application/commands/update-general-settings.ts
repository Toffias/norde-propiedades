import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { UpdateGeneralSettingsInputSchema, type UpdateGeneralSettingsInput } from '../../contracts';
import type { InvalidCompanySettingsError } from '../../domain/company-settings';
import { WebUrlTemplate, type InvalidWebUrlTemplateError } from '../../domain/web-url-template';
import { companySettingsAuditState, saveCompanySettingsChange } from '../company-settings-changes';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type UpdateGeneralSettingsError =
  | ForbiddenError
  | ValidationFailedError
  | InvalidCompanySettingsError
  | (InvalidWebUrlTemplateError & { readonly field: 'property' | 'development' });

function template(
  raw: string | undefined,
  field: 'property' | 'development',
): Result<WebUrlTemplate | undefined, UpdateGeneralSettingsError> {
  if (raw === undefined || raw === '') return ok(undefined);
  const created = WebUrlTemplate.create(raw);
  return created.isErr() ? err({ ...created.error, field }) : ok(created.value);
}

/** Nombre, zona horaria, URLs de la web y alcance de Noticias. */
export class UpdateGeneralSettings {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateGeneralSettingsInput,
    actor: Actor,
  ): Promise<Result<void, UpdateGeneralSettingsError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(UpdateGeneralSettingsInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const data = parsed.value;

    const property = template(data.webPropertyUrlTemplate, 'property');
    if (property.isErr()) return err(property.error);
    const development = template(data.webDevelopmentUrlTemplate, 'development');
    if (development.isErr()) return err(development.error);

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateGeneralSettingsError>> => {
      const settings = await tx.companySettings.get();
      const before = companySettingsAuditState(settings);
      const updated = settings.updateGeneral(
        {
          name: data.name,
          timezone: data.timezone,
          webPropertyUrlTemplate: property.value,
          webDevelopmentUrlTemplate: development.value,
          newsScope: data.newsScope,
        },
        this.deps.clock.now(),
      );
      if (updated.isErr()) return err(updated.error);
      await saveCompanySettingsChange(tx, actor, settings, before);
      return ok(undefined);
    });
  }
}
