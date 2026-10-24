import { z } from 'zod';

import type { LocationOption } from './view';

const QuerySchema = z.object({ q: z.string().trim().min(2).max(80) });

export interface LocationsHandlerDeps {
  /** `false`: la IP pasó el límite de pedidos. */
  readonly allow: () => Promise<boolean>;
  readonly suggest: (q: string) => Promise<readonly LocationOption[]>;
}

/**
 * `GET /api/ubicaciones?q=pal`: sugerencias del buscador de barrios y localidades. Público, con
 * límite por IP; la respuesta se puede cachear un rato en el navegador.
 */
export function createLocationsHandler(deps: LocationsHandlerDeps) {
  return async (request: Request): Promise<Response> => {
    const parsed = QuerySchema.safeParse({
      q: new URL(request.url).searchParams.get('q') ?? '',
    });
    if (!parsed.success) return Response.json({ error: 'invalid query' }, { status: 400 });
    if (!(await deps.allow())) {
      return Response.json({ error: 'too many requests' }, { status: 429 });
    }
    const options = await deps.suggest(parsed.data.q);
    return Response.json(
      { options },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  };
}
