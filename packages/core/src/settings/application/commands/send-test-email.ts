import {
  auditAction,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { SendTestEmailInputSchema, type SendTestEmailInput } from '../../contracts';
import { COMPANY_SETTINGS_ID } from '../../domain/company-settings';
import type { CompanySettingsReader } from '../ports/company-settings-reader';
import type { Mailer, MailerError } from '../ports/mailer';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type SendTestEmailError = ForbiddenError | ValidationFailedError | MailerError;

/**
 * Manda un email de prueba con el remitente configurado, para verificar el proveedor. Queda en el
 * historial como acción, sin la dirección del destinatario.
 */
export class SendTestEmail {
  constructor(
    private readonly deps: {
      readonly settings: CompanySettingsReader;
      readonly mailer: Mailer;
      readonly uow: SettingsUnitOfWork;
    },
  ) {}

  async execute(
    input: SendTestEmailInput,
    actor: Actor,
  ): Promise<Result<void, SendTestEmailError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(SendTestEmailInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);

    const settings = (await this.deps.settings.get()).toSnapshot();
    const sent = await this.deps.mailer.send({
      to: parsed.value.to,
      subject: `Prueba de envío de ${settings.name}`,
      text: [
        'Este es un email de prueba enviado desde el panel de gestión.',
        'Si lo recibiste, el envío de emails está bien configurado.',
      ].join('\n\n'),
      fromName: settings.emailSender.fromName ?? settings.name,
      replyTo: settings.emailSender.replyTo?.value,
    });
    if (sent.isErr()) return err(sent.error);

    await this.deps.uow.run(async (tx) => {
      await tx.audit.record(
        auditAction(actor, {
          action: 'company_settings.test_email_sent',
          entityType: 'company_settings',
          entityId: COMPANY_SETTINGS_ID,
          clientIds: [],
        }),
      );
    });
    return ok(undefined);
  }
}
