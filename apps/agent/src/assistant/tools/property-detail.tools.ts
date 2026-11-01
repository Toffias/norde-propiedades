import { defineTool } from '@norde/agent-kit';
import { z } from 'zod';

import { presentCard, presentDetail, propertyReference } from '../property-presenter';
import type { CustomerTurnContext } from '../turn-context';

import { UnexpectedToolError, type AssistantToolDeps } from './tool-deps';

const PropertyParameters = z.object({
  property: z
    .string()
    .max(500)
    .describe('El id que devolvió search_properties, o el link de una ficha que pegó el cliente'),
});

const NOT_FOUND = { error: 'No hay una propiedad publicada con ese id o link' };

export function getPropertyTool(deps: AssistantToolDeps) {
  return defineTool<CustomerTurnContext, typeof PropertyParameters>({
    name: 'get_property',
    description:
      'Devuelve la ficha completa de una propiedad por id o por el link de su ficha: descripción, amenities, dirección y cantidad de fotos.',
    parameters: PropertyParameters,
    execute: async ({ property }, context) => {
      const result = await deps.getPropertyDetail.execute(propertyReference(property), deps.actor);
      if (result.isErr()) {
        if (result.error.type === 'Forbidden') {
          throw new UnexpectedToolError('get_property', 'forbidden');
        }
        return NOT_FOUND;
      }
      context.shownProperties.set(result.value.id, presentCard(result.value, deps.siteUrl));
      return presentDetail(result.value, deps.siteUrl);
    },
  });
}
