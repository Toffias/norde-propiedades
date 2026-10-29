import { describe, expect, it } from 'vitest';

import {
  formatAge,
  formatCount,
  formatMeters,
  formatMoney,
  formatPhone,
  formatSquareMeters,
  paragraphs,
} from './format';

const NBSP = ' ';

describe('formatMoney', () => {
  it('writes the currency, a non-breaking space and the rounded amount', () => {
    expect(formatMoney('USD', 37_000_000n)).toBe(`USD${NBSP}370.000`);
    expect(formatMoney('ARS', 12_000_049n)).toBe(`ARS${NBSP}120.000`);
    expect(formatMoney('ARS', 12_000_050n)).toBe(`ARS${NBSP}120.001`);
  });

  it('keeps large amounts exact', () => {
    expect(formatMoney('ARS', 123_456_789_012_345_600n)).toBe(`ARS${NBSP}1.234.567.890.123.456`);
  });
});

describe('units', () => {
  it('never splits a number from its unit', () => {
    expect(formatSquareMeters(193)).toBe(`193${NBSP}m²`);
    expect(formatSquareMeters(48.87)).toBe(`48,87${NBSP}m²`);
    expect(formatMeters(8.7)).toBe(`8,7${NBSP}m`);
  });

  it('uses the singular for one', () => {
    expect(formatAge(1)).toBe(`1${NBSP}año`);
    expect(formatAge(30)).toBe(`30${NBSP}años`);
    expect(formatAge(0)).toBe('A estrenar');
    expect(formatCount(1, 'baño', 'baños')).toBe(`1${NBSP}baño`);
    expect(formatCount(3, 'baño', 'baños')).toBe(`3${NBSP}baños`);
  });
});

describe('formatPhone', () => {
  it('formats Argentine numbers', () => {
    expect(formatPhone('+5491166899124')).toBe('+54 9 11 6689-9124');
    expect(formatPhone('+541146871674')).toBe('+54 11 4687-1674');
    expect(formatPhone('+5493515551234')).toBe('+54 9 3515551234');
    expect(formatPhone('+34600111222')).toBe('+34600111222');
  });
});

describe('paragraphs', () => {
  it('splits on blank lines and keeps single line breaks', () => {
    expect(paragraphs('Primero.\r\n\r\n- Uno\n- Dos  \n\n\n Último ')).toEqual([
      'Primero.',
      '- Uno\n- Dos',
      'Último',
    ]);
  });

  it('strips the HTML that comes from other systems', () => {
    expect(
      paragraphs('<p><span style="font-size:10px">Casa &amp; quincho</span></p><p>Uno<br>Dos</p>'),
    ).toEqual(['Casa & quincho', 'Uno\nDos']);
  });

  it('returns nothing for an empty description', () => {
    expect(paragraphs('  \n\n ')).toEqual([]);
  });
});
