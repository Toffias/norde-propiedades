import {
  Email,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type InvalidEmailError,
  type Result,
} from '../../../shared';
import { UpdateEmailSenderInputSchema, type UpdateEmailSenderInput } from '../../contracts';
import type { InvalidCompanySettingsError } from '../../domain/company-settings';
import { companySettingsAuditState, saveCompanySettingsChange } from '../company-settings-changes';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type UpdateEmailSenderError =
  ForbiddenError | ValidationFailedError | InvalidEmailError | InvalidCompanySettingsError;

/**
 * Nombre del remitente y dirección de respuesta de los emails de salida. La dirección de envío y
 * la API key del proveedor van por variables de entorno, no en la base.
 */
export class UpdateEmailSender {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateEmailSenderInput,
    actor: Actor,
  ): Promise<Result<void, UpdateEmailSenderError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(UpdateEmailSenderInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { fromName, replyTo: rawReplyTo } = parsed.value;

    let replyTo: Email | undefined;
    if (rawReplyTo !== undefined) {
      const created = Email.create(rawReplyTo);
      if (created.isErr()) return err(created.error);
      replyTo = created.value;
    }

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateEmailSenderError>> => {
      const settings = await tx.companySettings.get();
      const before = companySettingsAuditState(settings);
      const updated = settings.updateEmailSender({ fromName, replyTo }, this.deps.clock.now());
      if (updated.isErr()) return err(updated.error);
      await saveCompanySettingsChange(tx, actor, settings, before);
      return ok(undefined);
    });
  }
}
