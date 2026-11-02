import { defineTool } from '@norde/agent-kit';
import { z } from 'zod';

import { presentCard, presentDetail, propertyReference } from '../property-presenter';
import type { CustomerTurnContext } from '../turn-context';

import { UnexpectedToolError, type AssistantToolDeps } from './tool-deps';

const PropertyParameters = z.object({
  property: z
    .string()
    .max(500)
    .describe(
      'El id que devolvió search_properties, o lo que pasó el cliente: el link de una ficha del sitio, el código de la propiedad (ej. "DEP0001") o el link o número de un aviso de MercadoLibre o Zonaprop',
    ),
  portal: z
    .enum(['mercadolibre', 'zonaprop'])
    .nullable()
    .describe('De qué portal es, si el cliente dio solo el número de un aviso sin el link'),
});

const NOT_FOUND = { error: 'No hay una propiedad publicada con ese id, link o código' };
const OTHER_AD = { error: 'Ese aviso no es de una propiedad publicada de Norde' };

type Lookup = Parameters<AssistantToolDeps['getPropertyDetail']['execute']>[0];

export function getPropertyTool(deps: AssistantToolDeps) {
  /** Primero como aviso de un portal; si no lo es, como link de ficha, id o código. */
  async function lookup(
    property: string,
    portal: 'mercadolibre' | 'zonaprop' | null,
  ): Promise<Lookup | undefined> {
    const ad = await deps.findPropertyByPortalAd.execute(
      { reference: property, ...(portal === null ? {} : { provider: portal }) },
      deps.actor,
    );
    if (ad.isOk()) return { propertyId: ad.value.propertyId };
    if (ad.error.type === 'Forbidden') throw new UnexpectedToolError('get_property', 'forbidden');
    if (ad.error.type === 'PortalAdNotFound') return undefined;
    return propertyReference(property);
  }

  return defineTool<CustomerTurnContext, typeof PropertyParameters>({
    name: 'get_property',
    description:
      'Devuelve la ficha completa de una propiedad (descripción, amenities, dirección y cantidad de fotos) por id, link de su ficha, código o aviso de MercadoLibre o Zonaprop.',
    parameters: PropertyParameters,
    execute: async ({ property, portal }, context) => {
      const reference = await lookup(property, portal);
      if (reference === undefined) return OTHER_AD;
      const result = await deps.getPropertyDetail.execute(reference, deps.actor);
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
