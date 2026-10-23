import { clientIp } from '../../../lib/client-ip';
import { createLocationsHandler } from '../../../lib/properties/locations-handler';
import { suggestLocations } from '../../../lib/properties/queries';
import { createRateLimiter } from '../../../lib/rate-limit';

// Autocompletado del buscador de barrios y localidades (listado y home).

/** Pedidos por IP cada 10 minutos: cada letra que se escribe es uno. */
const allow = createRateLimiter(600, () => Date.now());

const handle = createLocationsHandler({
  allow: async () => allow(await clientIp()),
  suggest: suggestLocations,
});

export function GET(request: Request): Promise<Response> {
  return handle(request);
}
