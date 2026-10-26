import { defineTool } from '@norde/agent-kit';
import { z } from 'zod';

import { presentCard, presentDetail } from '../property-presenter';
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
      context.shownProperties.set(result.value.id, presentCard(result.value, deps.siteUrl));
      return presentDetail(result.value, deps.siteUrl);
    },
  });
}
