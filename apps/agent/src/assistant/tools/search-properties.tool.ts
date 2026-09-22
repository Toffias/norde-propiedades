import { defineTool } from '@norde/agent-kit';
import { CURRENCIES, OPERATIONS, PROPERTY_TYPES } from '@norde/core/properties';
import { z } from 'zod';

import { presentSummary, toCents } from '../property-presenter';
import type { ContactSearch, CustomerTurnContext } from '../turn-context';

import { UnexpectedToolError, type AssistantToolDeps } from './tool-deps';

// Modo estricto de OpenAI: todos los campos presentes, `null` cuando no aplica.
const Parameters = z.object({
  operation: z.enum(OPERATIONS).nullable().describe('sale = venta, rent = alquiler'),
  propertyType: z.enum(PROPERTY_TYPES).nullable(),
  location: z
    .string()
    .max(100)
    .nullable()
    .describe('Barrio, localidad o zona en texto libre, ej. "Palermo", "Vicente López"'),
  minPrice: z.number().nonnegative().nullable().describe('En la moneda indicada, sin centavos'),
  maxPrice: z.number().nonnegative().nullable(),
  currency: z.enum(CURRENCIES).nullable().describe('Moneda del rango de precio'),
  minRooms: z.int().min(0).max(20).nullable().describe('Ambientes mínimos'),
  maxRooms: z.int().min(0).max(20).nullable(),
  minBedrooms: z.int().min(0).max(20).nullable().describe('Dormitorios mínimos'),
  minSurface: z.number().nonnegative().nullable().describe('Superficie total mínima en m²'),
  amenities: z
    .array(z.string().max(40))
    .max(10)
    .nullable()
    .describe('Ej. ["cochera", "pileta", "apto mascotas", "balcón"]'),
  page: z.int().min(1).max(50).nullable().describe('Página de resultados, empieza en 1'),
});

const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined;

export function searchPropertiesTool(deps: AssistantToolDeps) {
  return defineTool<CustomerTurnContext, typeof Parameters>({
    name: 'search_properties',
    description:
      'Busca propiedades disponibles de Norde con filtros. Devuelve hasta 3 resultados por página y el total. Usala apenas tengas operación, tipo y zona; el resto de los filtros es opcional.',
    parameters: Parameters,
    execute: async (args, context) => {
      const search: ContactSearch = {
        operation: orUndefined(args.operation),
        propertyType: orUndefined(args.propertyType),
        location: orUndefined(args.location),
        currency: orUndefined(args.currency),
        minPriceCents: args.minPrice === null ? undefined : toCents(args.minPrice),
        maxPriceCents: args.maxPrice === null ? undefined : toCents(args.maxPrice),
        minRooms: orUndefined(args.minRooms),
        maxRooms: orUndefined(args.maxRooms),
        minBedrooms: orUndefined(args.minBedrooms),
        amenities: orUndefined(args.amenities),
      };

      const result = await deps.searchProperties.execute(
        {
          operation: orUndefined(args.operation),
          propertyType: orUndefined(args.propertyType),
          location: orUndefined(args.location),
          currency: orUndefined(args.currency),
          minPriceCents: search.minPriceCents,
          maxPriceCents: search.maxPriceCents,
          minRooms: orUndefined(args.minRooms),
          maxRooms: orUndefined(args.maxRooms),
          minBedrooms: orUndefined(args.minBedrooms),
          minSurfaceM2: orUndefined(args.minSurface),
          amenities: orUndefined(args.amenities),
          page: args.page ?? 1,
          pageSize: 3,
        },
        deps.actor,
      );
      if (result.isErr()) {
        if (result.error.type === 'Forbidden') {
          throw new UnexpectedToolError('search_properties', 'forbidden');
        }
        return { error: 'Búsqueda inválida', details: result.error.issues };
      }

      const page = result.value;
      context.lastSearch = search;
      for (const property of page.items) {
        context.shownProperties.set(property.id, { id: property.id, title: property.title });
      }
      return {
        total: page.total,
        page: page.page,
        hasMore: page.page * page.pageSize < page.total,
        items: page.items.map((p) => presentSummary(p, deps.siteUrl)),
      };
    },
  });
}
