import { defineTool } from '@norde/agent-kit';
import { z } from 'zod';

import type { CustomerTurnContext } from '../turn-context';

export const MAX_BUTTONS = 3;
export const BUTTON_TITLE_LIMIT = 20;

const Parameters = z.object({
  options: z
    .array(z.string().min(1).max(BUTTON_TITLE_LIMIT))
    .min(1)
    .max(MAX_BUTTONS)
    .describe(`Títulos de los botones, de hasta ${BUTTON_TITLE_LIMIT} caracteres cada uno`),
});

/** No llama a ningún caso de uso: solo marca en el turno cómo cerrar la respuesta. */
export function offerButtonsTool() {
  return defineTool<CustomerTurnContext, typeof Parameters>({
    name: 'offer_buttons',
    description:
      'Agrega hasta 3 botones de respuesta rápida a tu mensaje, para preguntas cerradas (ej. "Comprar" / "Alquilar", "Ver más" / "Ajustar búsqueda" / "Hablar con asesor"). Tu texto es la pregunta; no repitas las opciones en el texto.',
    parameters: Parameters,
    execute: ({ options }, context) => {
      context.buttons = options.slice(0, MAX_BUTTONS).map((title, i) => ({
        id: `opt_${i + 1}`,
        title: title.slice(0, BUTTON_TITLE_LIMIT),
      }));
      return Promise.resolve({ ok: true, buttons: context.buttons.map((b) => b.title) });
    },
  });
}
