import { describe, expect, it } from 'vitest';

import { conditionLines } from './rule-format';

const NONE = {
  channels: [],
  operations: [],
  propertyTypes: [],
  neighborhoods: [],
  properties: [],
  developmentIds: [],
} as const;

describe('conditionLines', () => {
  it('says each condition with values in words', () => {
    expect(
      conditionLines({
        ...NONE,
        channels: ['zonaprop', 'web_form'],
        operations: ['rent'],
        neighborhoods: ['Palermo'],
        properties: [{ id: 'p1', summary: undefined }],
      }),
    ).toEqual([
      { label: 'Canal', values: ['Zonaprop', 'Formulario de la web'] },
      { label: 'Operación', values: ['Alquiler'] },
      { label: 'Zona', values: ['Palermo'] },
      { label: 'Propiedad', values: ['Ya no está en la cartera'] },
    ]);
  });

  it('has no lines when the rule takes any inquiry', () => {
    expect(conditionLines(NONE)).toEqual([]);
  });
});
