import type { StoredFileDelivery } from '@norde/core/properties/contracts';
import type { Result } from '@norde/core/shared';

// Respuesta HTTP para un archivo del storage: redirección a la URL firmada (S3/R2) o el contenido
// (disco local). El caso de uso ya autorizó el pedido.

/** `Content-Disposition` con el nombre original, también con acentos (RFC 6266). */
function disposition(kind: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function deliverFile(
  result: Result<StoredFileDelivery, { readonly type: string }>,
  options: { readonly inline: boolean },
): Response {
  if (result.isErr()) {
    const status = result.error.type === 'Forbidden' ? 403 : 404;
    return new Response(null, { status });
  }
  const file = result.value;
  if (file.kind === 'redirect') {
    return new Response(null, {
      status: 302,
      headers: { Location: file.url, 'Cache-Control': 'private, no-store' },
    });
  }
  return new Response(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': disposition(options.inline ? 'inline' : 'attachment', file.fileName),
      // Las fotos se piden muchas veces en la galería: se cachean en el navegador un rato.
      'Cache-Control': options.inline ? 'private, max-age=300' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
