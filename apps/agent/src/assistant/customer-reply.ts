import { z } from 'zod';

import type { AssistantToolDeps } from './tools/tool-deps';
import type { CustomerTurnContext } from './turn-context';

export const MAX_BUTTONS = 3;
export const BUTTON_TITLE_LIMIT = 20;

// Modo estricto de OpenAI: todos los campos presentes. Los topes se aplican al leer la respuesta,
// así un botón un poco más largo se recorta en lugar de hacer fallar el turno.
/** La respuesta final del agente: el texto y cómo cerrarlo (botones o una foto). */
export const CustomerReplySchema = z.object({
  text: z
    .string()
    .describe('Tu mensaje al cliente. Si mandás una foto, es su epígrafe (máximo 1000 caracteres)'),
  buttons: z
    .array(z.string())
    .describe(
      `Hasta ${MAX_BUTTONS} botones de respuesta rápida, de hasta ${BUTTON_TITLE_LIMIT} caracteres, para preguntas cerradas (ej. "Comprar" / "Alquilar"). Vacío si no hace falta. Tu texto es la pregunta: no repitas las opciones en él`,
    ),
  photoPropertyId: z
    .string()
    .nullable()
    .describe(
      'Id de una propiedad (el que devolvieron las herramientas) para adjuntar su foto principal. Solo si el cliente pidió ver fotos y la propiedad tiene fotos; si no, null',
    ),
});

export type CustomerReply = z.infer<typeof CustomerReplySchema>;

/**
 * Pasa la respuesta del modelo al turno: devuelve el texto y completa los botones y la foto, que
 * el canal usa para armar **un** mensaje. Una foto que no existe o no se puede mandar se ignora.
 */
export async function applyCustomerReply(
  output: unknown,
  context: CustomerTurnContext,
  deps: Pick<AssistantToolDeps, 'actor' | 'siteUrl' | 'getPropertyDetail'>,
): Promise<string | undefined> {
  const parsed = CustomerReplySchema.safeParse(output);
  if (!parsed.success) return undefined;
  const reply = parsed.data;

  const buttons = reply.buttons
    .map((title) => title.trim().slice(0, BUTTON_TITLE_LIMIT))
    .filter((title) => title !== '')
    .slice(0, MAX_BUTTONS);
  if (buttons.length > 0) {
    context.buttons = buttons.map((title, i) => ({ id: `opt_${i + 1}`, title }));
  }

  if (reply.photoPropertyId) {
    const photo = await coverPhoto(reply.photoPropertyId, deps);
    if (photo) context.photo = photo;
  }

  return reply.text.trim() === '' ? undefined : reply.text;
}

async function coverPhoto(
  propertyId: string,
  deps: Pick<AssistantToolDeps, 'actor' | 'siteUrl' | 'getPropertyDetail'>,
): Promise<CustomerTurnContext['photo']> {
  const result = await deps.getPropertyDetail.execute({ propertyId }, deps.actor);
  if (result.isErr()) {
    if (result.error.type === 'Forbidden') throw new Error('Agent cannot read properties');
    return undefined;
  }
  // La portada, por la ruta pública del sitio. WhatsApp solo descarga imágenes por HTTPS.
  const cover = result.value.cover;
  const url = cover ? new URL(cover.src, deps.siteUrl).toString() : undefined;
  return url?.startsWith('https://') ? { url, propertyId: result.value.id } : undefined;
}
