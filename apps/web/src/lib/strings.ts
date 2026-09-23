/** Texto recortado, o `undefined` si queda vacío (para encadenar valores por defecto con `??`). */
export function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}
