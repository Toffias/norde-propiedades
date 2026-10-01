import { z } from 'zod';

/**
 * Mensajes de validación en español rioplatense para los formularios (los schemas son los contracts
 * del core, que no definen mensajes). Lo que no cubre este mapa cae en el locale `es` de Zod.
 */
export const spanishErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined || issue.input === null ? 'Completá este campo.' : undefined;
    case 'too_small':
      if (issue.origin === 'string') {
        return Number(issue.minimum) <= 1
          ? 'Completá este campo.'
          : `Tiene que tener al menos ${String(issue.minimum)} caracteres.`;
      }
      if (issue.origin === 'array' || issue.origin === 'set') {
        return `Elegí al menos ${String(issue.minimum)}.`;
      }
      return `Tiene que ser ${issue.inclusive === false ? 'mayor que' : 'como mínimo'} ${String(issue.minimum)}.`;
    case 'too_big':
      if (issue.origin === 'string') {
        return `Puede tener hasta ${String(issue.maximum)} caracteres.`;
      }
      if (issue.origin === 'array' || issue.origin === 'set') {
        return `Podés elegir hasta ${String(issue.maximum)}.`;
      }
      return `Tiene que ser ${issue.inclusive === false ? 'menor que' : 'como máximo'} ${String(issue.maximum)}.`;
    case 'invalid_value':
      return 'Elegí una opción válida.';
    case 'invalid_format':
      return issue.format === 'email' ? 'Ingresá un email válido.' : 'El formato no es válido.';
    case 'custom':
    case 'unrecognized_keys':
    case 'not_multiple_of':
    case 'invalid_union':
    case 'invalid_key':
    case 'invalid_element':
      return undefined;
  }
};

let configured = false;

/** Configura Zod una sola vez por proceso (o por bundle, en el navegador). */
export function configureZodMessages(): void {
  if (configured) return;
  z.config(z.locales.es());
  z.config({ customError: spanishErrorMap });
  configured = true;
}
