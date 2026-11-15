/**
 * Lee el body de una respuesta hasta `maxBytes` y corta la descarga apenas se pasa, sin esperar a
 * que llegue entera. `undefined` si se pasó.
 */
export async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.body) return new Uint8Array();
  // Los tipos de `fetch` en Node dejan el stream como `ReadableStream<any>`; un body HTTP son bytes.
  const body = response.body as ReadableStream<Uint8Array>;
  const reader = body.getReader();
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
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
