/**
 * Lee el body de un pedido hasta `maxBytes` y corta apenas se pasa, sin esperar a que llegue
 * entero (con `Transfer-Encoding: chunked` no hay `content-length` que mirar antes). `undefined`
 * si se pasó.
 */
export async function readLimitedBody(
  request: Request,
  maxBytes: number,
): Promise<Buffer | undefined> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return undefined;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
