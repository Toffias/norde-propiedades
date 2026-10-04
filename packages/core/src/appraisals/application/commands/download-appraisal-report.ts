import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { CompanySettingsReader, FileStorage } from '../../../settings';
import { AppraisalIdInputSchema, type AppraisalIdInput } from '../../contracts';
import {
  appraisalReportFileName,
  checkAppraisalReportable,
  type AppraisalNotReportableError,
} from '../../domain/appraisal-report';
import {
  invalidInput,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalQuery } from '../ports/appraisal-query';
import type { AppraisalReportRenderer } from '../ports/appraisal-report-renderer';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';
import type { PanelDirectory } from '../ports/panel-directory';
import { readAppraisalDetail } from '../queries/get-appraisal';

export type DownloadAppraisalReportError =
  ForbiddenError | InvalidInputError | AppraisalNotFoundError | AppraisalNotReportableError;

export interface AppraisalReportFile {
  readonly fileName: string;
  readonly contentType: 'application/pdf';
  readonly bytes: Uint8Array;
}

/**
 * El informe de la tasación en PDF, con la marca de la empresa, para entregárselo al propietario:
 * valores sugeridos, comparables con su valor por m², observaciones y fotos. Lo descarga quien
 * puede ver la tasación, si está tasada y tiene un valor. La descarga queda en su historial.
 */
export class DownloadAppraisalReport {
  constructor(
    private readonly deps: {
      readonly uow: AppraisalsUnitOfWork;
      readonly appraisals: AppraisalQuery;
      readonly directory: PanelDirectory;
      readonly storage: FileStorage;
      readonly settings: CompanySettingsReader;
      readonly renderer: AppraisalReportRenderer;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: AppraisalIdInput,
    actor: Actor,
  ): Promise<Result<AppraisalReportFile, DownloadAppraisalReportError>> {
    if (!actor.can('appraisals:read')) return err({ type: 'Forbidden' });
    const parsed = AppraisalIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = parseId<'Appraisal'>(parsed.data.appraisalId);
    if (id.isErr()) return err({ type: 'AppraisalNotFound' });

    const appraisal = await readAppraisalDetail(this.deps, id.value, actor);
    if (!appraisal) return err({ type: 'AppraisalNotFound' });
    const reportable = checkAppraisalReportable(appraisal);
    if (reportable.isErr()) return err(reportable.error);

    const photos = await this.deps.uow.run((tx) => tx.photos.listByAppraisal(id.value));
    const settings = (await this.deps.settings.get()).toSnapshot();
    const logo =
      settings.logoKey === undefined ? undefined : await this.deps.storage.get(settings.logoKey);
    const bytes = await this.deps.renderer.render({
      appraisal,
      photos: this.photoBytes(photos.map((photo) => photo.storageKey)),
      company: { name: settings.name, logo: logo?.bytes },
      generatedAt: this.deps.clock.now(),
    });

    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(actor, {
          action: 'appraisal.report_downloaded',
          entityType: 'appraisal',
          entityId: appraisal.id,
          clientIds: [appraisal.requester.id],
        }),
      ),
    );
    return ok({
      fileName: appraisalReportFileName(appraisal.code),
      contentType: 'application/pdf',
      bytes,
    });
  }

  /** Una foto que ya no está en el storage se omite. */
  private async *photoBytes(keys: readonly string[]): AsyncIterable<Uint8Array> {
    for (const key of keys) {
      const stored = await this.deps.storage.get(key);
      if (stored) yield stored.bytes;
    }
  }
}
