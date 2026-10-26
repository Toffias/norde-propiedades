import { describe, expect, it } from 'vitest';

import { toolCallsForLog } from './tool-call-log';

describe('toolCallsForLog', () => {
  it('keeps search filters and hides personal data', () => {
    expect(
      toolCallsForLog([
        { name: 'search_properties', arguments: { location: 'Palermo', maxPrice: 120000 } },
        {
          name: 'register_client',
          arguments: { name: 'Ana', email: 'ana@example.com', phone: null, notes: 'DNI…' },
        },
        { name: 'get_property', arguments: 'no es JSON' },
      ]),
    ).toEqual([
      { name: 'search_properties', arguments: { location: 'Palermo', maxPrice: 120000 } },
      {
        name: 'register_client',
        arguments: { name: '[redacted]', email: '[redacted]', phone: null, notes: '[redacted]' },
      },
      { name: 'get_property', arguments: '[unparsed]' },
    ]);
  });
});
