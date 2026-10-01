import { err, ok, type Result } from '../../shared/domain/result';

/** Variables que se pueden usar en el pie de descripción para portales. */
export const FOOTER_VARIABLES = [
  'codigo',
  'telefono_sucursal',
  'email_sucursal',
  'whatsapp_sucursal',
  'url_web',
] as const;
export type FooterVariable = (typeof FOOTER_VARIABLES)[number];

export const MAX_FOOTER_LENGTH = 1000;

export type InvalidFooterTemplateError =
  | { readonly type: 'FooterTooLong' }
  | { readonly type: 'UnknownTemplateVariable'; readonly variable: string };

const VARIABLE = /\{([^{}\s]*)\}/g;

function isFooterVariable(name: string): name is FooterVariable {
  return FOOTER_VARIABLES.some((variable) => variable === name);
}

/**
 * Pie que se agrega a la descripción de cada propiedad al publicarla en portales
 * ("Código {codigo}. Consultas al {telefono_sucursal}"). Solo acepta las variables conocidas.
 */
export class DescriptionFooterTemplate {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<DescriptionFooterTemplate, InvalidFooterTemplateError> {
    const value = raw.trim();
    if (value.length > MAX_FOOTER_LENGTH) return err({ type: 'FooterTooLong' });
    for (const match of value.matchAll(VARIABLE)) {
      const name = match[1] ?? '';
      if (!isFooterVariable(name)) return err({ type: 'UnknownTemplateVariable', variable: name });
    }
    return ok(new DescriptionFooterTemplate(value));
  }

  /** Arma el pie de una propiedad. Una variable sin valor queda vacía. */
  render(values: Partial<Readonly<Record<FooterVariable, string>>>): string {
    return this.value
      .replace(VARIABLE, (_match, name: string) =>
        isFooterVariable(name) ? (values[name] ?? '') : '',
      )
      .trim();
  }
}
