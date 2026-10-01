import { err, ok, type Result } from '../../shared/domain/result';

export interface InvalidWebUrlTemplateError {
  readonly type: 'InvalidWebUrlTemplate';
}

const PLACEHOLDERS = ['{id}', '{slug}'] as const;
const MAX_LENGTH = 300;
const HTTPS_URL = /^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i;

function countOccurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

/**
 * Plantilla de la URL pública de una ficha en la web (`https://norde.com.ar/propiedades/{slug}`).
 * Lleva exactamente un comodín, `{id}` o `{slug}`, que se reemplaza al armar el link.
 */
export class WebUrlTemplate {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<WebUrlTemplate, InvalidWebUrlTemplateError> {
    const value = raw.trim();
    if (value.length > MAX_LENGTH) return err({ type: 'InvalidWebUrlTemplate' });
    const placeholders = PLACEHOLDERS.reduce(
      (total, token) => total + countOccurrences(value, token),
      0,
    );
    if (placeholders !== 1) return err({ type: 'InvalidWebUrlTemplate' });
    // El comodín se valida aparte: la URL tiene que ser válida con un valor cualquiera.
    if (!HTTPS_URL.test(value.replace('{id}', 'x').replace('{slug}', 'x'))) {
      return err({ type: 'InvalidWebUrlTemplate' });
    }
    return ok(new WebUrlTemplate(value));
  }

  /** La URL de una ficha: reemplaza el comodín por el ID o el slug. */
  render(values: { readonly id: string; readonly slug: string }): string {
    return this.value
      .replace('{id}', encodeURIComponent(values.id))
      .replace('{slug}', encodeURIComponent(values.slug));
  }
}
