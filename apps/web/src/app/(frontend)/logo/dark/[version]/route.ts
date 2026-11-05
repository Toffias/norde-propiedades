import { companyLogoResponse } from '../../../../../lib/brand/company-logo';

// El logo para fondos oscuros que Norde cargó en el panel (Mi empresa), para el tema oscuro.

export async function GET(
  _request: Request,
  context: RouteContext<'/logo/dark/[version]'>,
): Promise<Response> {
  const { version } = await context.params;
  return companyLogoResponse('dark', version);
}
