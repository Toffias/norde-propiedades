import { companyLogoResponse } from '../../../../lib/brand/company-logo';

// El logo que Norde cargó en el panel (Mi empresa), para el header y el footer.

export async function GET(
  _request: Request,
  context: RouteContext<'/logo/[version]'>,
): Promise<Response> {
  const { version } = await context.params;
  return companyLogoResponse('light', version);
}
