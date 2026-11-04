import type { Operation } from '@norde/core/properties/contracts';
import { z } from 'zod';

import { operationFromParam } from './search-params';
import type { LocationOption } from './view';

const QuerySchema = z.object({
  /** Sin texto: los barrios y localidades con más propiedades (el desplegable recién abierto). */
  q: z.union([z.literal(''), z.string().trim().min(2).max(80)]),
  /** `venta`, `alquiler`…: cuenta solo las de esa operación. Un valor desconocido se ignora. */
  operacion: z.string().max(40),
});

export interface LocationsHandlerDeps {
  /** `false`: la IP pasó el límite de pedidos. */
  readonly allow: () => Promise<boolean>;
  readonly suggest: (
    q: string,
    operation: Operation | undefined,
  ) => Promise<readonly LocationOption[]>;
}

/**
 * `GET /api/ubicaciones?q=pal&operacion=venta`: opciones del buscador de barrios y localidades,
 * con cuántas propiedades tiene cada una. Público, con límite por IP; la respuesta se puede
 * cachear un rato en el navegador.
 */
export function createLocationsHandler(deps: LocationsHandlerDeps) {
  return async (request: Request): Promise<Response> => {
    const params = new URL(request.url).searchParams;
    const parsed = QuerySchema.safeParse({
      q: params.get('q') ?? '',
      operacion: params.get('operacion') ?? '',
    });
    if (!parsed.success) return Response.json({ error: 'invalid query' }, { status: 400 });
    if (!(await deps.allow())) {
      return Response.json({ error: 'too many requests' }, { status: 429 });
    }
    const options = await deps.suggest(parsed.data.q, operationFromParam(parsed.data.operacion));
    return Response.json(
      { options },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  };
}
