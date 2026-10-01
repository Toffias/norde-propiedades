import { getContainer } from '../../../../../container';
import { getSession } from '../../../../../lib/session';

// Logo de la empresa o de la marca de agua, servido por el panel: el storage es privado y el caso
// de uso decide quién lo ve.

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly which: string }> },
) {
  const { which } = await params;
  if (which !== 'company' && which !== 'watermark') return new Response(null, { status: 404 });
  const session = await getSession();
  if (session.isErr()) return new Response(null, { status: 401 });

  const result = await getContainer().settings.getCompanyLogo.execute(
    { which },
    session.value.actor,
  );
  if (result.isErr()) {
    return new Response(null, { status: result.error.type === 'Forbidden' ? 403 : 404 });
  }
  return new Response(Buffer.from(result.value.bytes), {
    headers: {
      'Content-Type': result.value.contentType,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
