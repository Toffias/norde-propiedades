import { defineTool } from '@norde/agent-kit';
import { z } from 'zod';

import { presentDetail } from '../property-presenter';
import type { CustomerTurnContext } from '../turn-context';

import { UnexpectedToolError, type AssistantToolDeps } from './tool-deps';

const PropertyIdParameters = z.object({
  propertyId: z.string().max(64).describe('El id que devolvió search_properties'),
});

const NOT_FOUND = { error: 'No hay una propiedad publicada con ese id' };

export function getPropertyTool(deps: AssistantToolDeps) {
  return defineTool<CustomerTurnContext, typeof PropertyIdParameters>({
    name: 'get_property',
    description:
      'Devuelve la ficha completa de una propiedad por id: descripción, amenities, dirección y cantidad de fotos.',
    parameters: PropertyIdParameters,
    execute: async ({ propertyId }, context) => {
      const result = await deps.getPropertyDetail.execute({ propertyId }, deps.actor);
      if (result.isErr()) {
        if (result.error.type === 'Forbidden') {
          throw new UnexpectedToolError('get_property', 'forbidden');
        }
        return NOT_FOUND;
      }
      context.shownProperties.set(result.value.id, {
        id: result.value.id,
        title: result.value.title,
      });
      return presentDetail(result.value, deps.siteUrl);
    },
  });
}

export function showPhotoTool(deps: AssistantToolDeps) {
  return defineTool<CustomerTurnContext, typeof PropertyIdParameters>({
    name: 'show_photo',
    description:
      'Adjunta la foto principal de una propiedad a tu respuesta. Usala solo cuando el cliente pide ver fotos. Tu texto se envía como epígrafe de la foto (máximo 1000 caracteres).',
    parameters: PropertyIdParameters,
    execute: async ({ propertyId }, context) => {
      const result = await deps.getPropertyDetail.execute({ propertyId }, deps.actor);
      if (result.isErr()) {
        if (result.error.type === 'Forbidden') {
          throw new UnexpectedToolError('show_photo', 'forbidden');
        }
        return NOT_FOUND;
      }
      // La portada, por la ruta pública del sitio. WhatsApp solo descarga imágenes por HTTPS.
      const cover = result.value.cover;
      const url = cover ? new URL(cover.src, deps.siteUrl).toString() : undefined;
      if (!url?.startsWith('https://'))
        return { ok: false, reason: 'La propiedad no tiene fotos disponibles' };

      context.photo = { url, propertyId: result.value.id };
      return { ok: true, title: result.value.title };
    },
  });
}
