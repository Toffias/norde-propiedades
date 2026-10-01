import { getContainer } from '../../../../../../container';
import { getSession } from '../../../../../../lib/session';

// Descarga de un archivo del gestor. El storage es privado: el caso de uso autoriza cada descarga.

/** `Content-Disposition` con el nombre original, también con acentos (RFC 6266). */
function attachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly fileId: string }> },
) {
  const session = await getSession();
  if (session.isErr()) return new Response(null, { status: 401 });
  const { fileId } = await params;

  const result = await getContainer().settings.getCompanyFileDownload.execute(
    { fileId },
    session.value.actor,
  );
  if (result.isErr()) {
    return new Response(null, { status: result.error.type === 'Forbidden' ? 403 : 404 });
  }
  return new Response(Buffer.from(result.value.bytes), {
    headers: {
      'Content-Type': result.value.contentType,
      'Content-Disposition': attachment(result.value.fileName),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
