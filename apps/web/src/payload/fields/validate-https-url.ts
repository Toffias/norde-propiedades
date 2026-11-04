import type { TextFieldSingleValidation } from 'payload';

/** Un link opcional a otro sitio: vacío, o una URL `https://` válida. */
export const validateHttpsUrl: TextFieldSingleValidation = (value) => {
  if (!value) return true;
  if (!URL.canParse(value)) return 'No es un link válido.';
  return new URL(value).protocol === 'https:' ? true : 'Tiene que empezar con https://';
};
