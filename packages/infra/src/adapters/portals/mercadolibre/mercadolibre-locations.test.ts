import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { MercadoLibreLocations, normalizeName } from './mercadolibre-locations';

// Respuestas grabadas de /classified_locations (MLA, 2026-10-06), recortadas.
const COUNTRY = {
  id: 'AR',
  name: 'Argentina',
  states: [
    { id: 'TUxBUENBUGw3M2E1', name: 'Capital Federal' },
    { id: 'TUxBUEdSQWU4ZDkz', name: 'Bs.As. G.B.A. Norte' },
    { id: 'TUxBUEdSQWVmNTVm', name: 'Bs.As. G.B.A. Oeste' },
    { id: 'TUxBUENPUmFkZGIw', name: 'Córdoba' },
  ],
};
const CAPITAL = {
  id: 'TUxBUENBUGw3M2E1',
  cities: [{ id: 'TUxBQ0NBUGZlZG1sYQ', name: 'Capital Federal' }],
};
const GBA_NORTE = {
  id: 'TUxBUEdSQWU4ZDkz',
  cities: [
    { id: 'TUxBQ1NBTjg4ZmJk', name: 'San Isidro' },
    { id: 'TUxBQ1BJTGFyMTIz', name: 'Pilar' },
  ],
};
const GBA_OESTE = { id: 'TUxBUEdSQWVmNTVm', cities: [{ id: 'TUxBQ01PUjU0', name: 'Morón' }] };
const CABA_CITY = {
  id: 'TUxBQ0NBUGZlZG1sYQ',
  neighborhoods: [
    { id: 'TUxBQlBBTDI1MTVa', name: 'Palermo' },
    { id: 'TUxBQk7a0TcwOTRa', name: 'Núñez' },
  ],
};
const SAN_ISIDRO = {
  id: 'TUxBQ1NBTjg4ZmJk',
  neighborhoods: [{ id: 'TUxBQkFDQTMyNzNa', name: 'Acassuso' }],
};

const ROUTES: Record<string, unknown> = {
  '/classified_locations/countries/AR': COUNTRY,
  '/classified_locations/states/TUxBUENBUGw3M2E1': CAPITAL,
  '/classified_locations/states/TUxBUEdSQWU4ZDkz': GBA_NORTE,
  '/classified_locations/states/TUxBUEdSQWVmNTVm': GBA_OESTE,
  '/classified_locations/cities/TUxBQ0NBUGZlZG1sYQ': CABA_CITY,
  '/classified_locations/cities/TUxBQ1NBTjg4ZmJk': SAN_ISIDRO,
  '/classified_locations/cities/TUxBQ1BJTGFyMTIz': {
    id: 'TUxBQ1BJTGFyMTIz',
    neighborhoods: [{ id: 'TUxBQlBJTDEw', name: 'Pilar Centro' }],
  },
  '/classified_locations/states/TUxBUENPUmFkZGIw': {
    id: 'TUxBUENPUmFkZGIw',
    cities: [{ id: 'TUxBQ0NPUjE', name: 'Córdoba' }],
  },
};

function setup(failing = false) {
  const requests: string[] = [];
  const logger: InfraLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const fakeFetch: typeof fetch = (input) => {
    const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
    requests.push(path);
    if (failing) return Promise.resolve(Response.json({}, { status: 503 }));
    const body = ROUTES[path];
    return Promise.resolve(body ? Response.json(body) : Response.json({}, { status: 404 }));
  };
  const locations = new MercadoLibreLocations({ logger, now: () => 0, fetch: fakeFetch });
  return { locations, requests };
}

describe('normalizeName', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeName('Bs.As. G.B.A. Norte')).toBe('bs as g b a norte');
    expect(normalizeName('Núñez')).toBe('nunez');
  });
});

describe('MercadoLibreLocations', () => {
  it('finds a neighborhood of Buenos Aires city by its name', async () => {
    const { locations } = setup();
    expect(
      unwrap(await locations.resolve({ province: 'CABA', city: 'CABA', neighborhood: 'Nuñez' })),
    ).toEqual({ neighborhood: { id: 'TUxBQk7a0TcwOTRa' } });
  });

  it('looks for a town of the province in every Greater Buenos Aires region', async () => {
    const { locations } = setup();
    expect(
      unwrap(
        await locations.resolve({
          province: 'Buenos Aires',
          city: 'San Isidro',
          neighborhood: 'Acassuso',
        }),
      ),
    ).toEqual({ neighborhood: { id: 'TUxBQkFDQTMyNzNa' } });
  });

  it('falls back to the city when the neighborhood is not in MercadoLibre', async () => {
    const { locations } = setup();
    expect(
      unwrap(
        await locations.resolve({
          province: 'Buenos Aires',
          city: 'Pilar',
          neighborhood: 'Del Viso',
        }),
      ),
    ).toEqual({ city: { id: 'TUxBQ1BJTGFyMTIz' } });
  });

  it('explains which place it could not find', async () => {
    const { locations } = setup();
    const error = unwrapErr(
      await locations.resolve({
        province: 'Córdoba',
        city: 'Villa Allende',
        neighborhood: undefined,
      }),
    );
    expect(error).toEqual({
      type: 'LocationNotFound',
      reason: expect.stringContaining('Villa Allende, Córdoba') as string,
    });
  });

  it('keeps the tree in memory', async () => {
    const { locations, requests } = setup();
    await locations.resolve({ province: 'CABA', city: 'CABA', neighborhood: 'Palermo' });
    await locations.resolve({ province: 'CABA', city: 'CABA', neighborhood: 'Palermo' });
    expect(requests).toHaveLength(3);
  });

  it('reports MercadoLibre as unavailable when it fails', async () => {
    const { locations } = setup(true);
    expect(
      unwrapErr(
        await locations.resolve({ province: 'CABA', city: 'CABA', neighborhood: 'Palermo' }),
      ),
    ).toEqual({ type: 'LocationUnavailable' });
  });
});
