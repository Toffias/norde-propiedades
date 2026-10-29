import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { CompanySettingsReader } from '../../../settings';
import type { PdfExportOptions } from '../../contracts';

/**
 * Lo que el diálogo de exportar a PDF necesita de "Ficha y PDF": si pregunta por los datos del
 * agente. Lo puede leer quien exporta, aunque no administre la configuración.
 */
export class GetPdfExportOptions {
  constructor(private readonly deps: { readonly settings: CompanySettingsReader }) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<PdfExportOptions, ForbiddenError>> {
    if (!actor.can('properties:export') && !actor.can('properties:export-bulk')) {
      return err({ type: 'Forbidden' });
    }
    const { pdfOptions } = (await this.deps.settings.get()).toSnapshot();
    return ok({ askAgent: pdfOptions.agentInfo === 'ask' });
  }
}
