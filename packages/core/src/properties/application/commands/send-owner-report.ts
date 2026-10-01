import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { CompanySettingsReader, FileStorage, Mailer, MailerError } from '../../../settings';
import { SendOwnerReportInputSchema, type SendOwnerReportInput } from '../../contracts';
import type { DocumentNotReadyError } from '../../domain/property-document';
import { idOf } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  findProperty,
  invalidInput,
  propertyTarget,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';

export interface DocumentNotFoundError {
  readonly type: 'DocumentNotFound';
}

export type SendOwnerReportError =
  | ForbiddenError
  | InvalidInputError
  | DocumentNotFoundError
  | DocumentNotReadyError
  | PropertyNotFoundError
  | MailerError;

/**
 * Manda el reporte al propietario por email, con el PDF adjunto. El destinatario no queda en el
 * historial (es un dato personal): queda que se envió y qué reporte.
 */
export class SendOwnerReport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly storage: FileStorage;
      readonly mailer: Mailer;
      readonly settings: CompanySettingsReader;
    },
  ) {}

  async execute(
    input: SendOwnerReportInput,
    actor: Actor,
  ): Promise<Result<void, SendOwnerReportError>> {
    if (!actor.can('properties:read') || !actor.can('properties:export')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = SendOwnerReportInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { documentId, to, message } = parsed.data;
    const id = idOf<'PropertyDocument'>(documentId);
    if (id === undefined) return err({ type: 'DocumentNotFound' });

    const loaded = await this.deps.uow.run(async (tx) => {
      const document = await tx.documents.findById(id);
      const property = document
        ? await findProperty(tx.properties, document.propertyId)
        : undefined;
      return { document, property };
    });
    const { document, property } = loaded;
    if (document?.kind !== 'owner_report') return err({ type: 'DocumentNotFound' });
    if (!property) return err({ type: 'PropertyNotFound' });
    const file = document.readyFile();
    if (file.isErr()) return err(file.error);
    const stored = await this.deps.storage.get(file.value);
    if (!stored) return err({ type: 'DocumentNotReady' });

    const company = (await this.deps.settings.get()).toSnapshot();
    const period = document.period;
    const range = period === undefined ? '' : ` (${period.from} al ${period.to})`;
    const sent = await this.deps.mailer.send({
      to,
      subject: `Reporte de su propiedad ${property.code}${range}`,
      text: [
        message ?? 'Le enviamos el reporte de actividad de su propiedad.',
        '',
        company.name,
      ].join('\n'),
      fromName: company.emailSender.fromName ?? company.name,
      replyTo: company.emailSender.replyTo?.value,
      attachments: [
        {
          fileName: `reporte-${property.code.toLowerCase()}.pdf`,
          contentType: 'application/pdf',
          bytes: stored.bytes,
        },
      ],
    });
    if (sent.isErr()) return err(sent.error);

    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(
          actor,
          propertyTarget('property.owner_report_sent', property.id),
          diffChanges({}, { documentId: document.id }),
        ),
      ),
    );
    return ok(undefined);
  }
}
