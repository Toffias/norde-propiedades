/**
 * Slug para URLs en español: sin acentos ni eñes ("Cómo se calcula el IPC" → "como-se-calcula-el-ipc").
 * El slugify por defecto de Payload descarta los caracteres acentuados ("cmo-se-calcula").
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
