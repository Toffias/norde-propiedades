import { describe, expect, it } from 'vitest';

import { guessStatIcon } from './stat-icons';

describe('guessStatIcon', () => {
  it.each([
    ['años en el barrio', 'years'],
    ['operaciones cerradas', 'deals'],
    ['consultas por mes', 'inquiries'],
    ['propiedades publicadas', 'properties'],
    ['servicios: venta, alquiler, tasación y administración', 'services'],
    ['localidades cubiertas', 'locations'],
    ['personas en el equipo', 'team'],
  ] as const)('maps "%s" to %s', (label, icon) => {
    expect(guessStatIcon(label)).toBe(icon);
  });

  it('returns null when nothing matches', () => {
    expect(guessStatIcon('otra cosa')).toBeNull();
  });
});
