import { describe, expect, it } from 'vitest';

import { readingTimeMinutes, summarize } from './text';

describe('readingTimeMinutes', () => {
  it('counts 200 words per minute, with a minimum of one', () => {
    expect(readingTimeMinutes('')).toBe(1);
    expect(readingTimeMinutes(Array.from({ length: 1000 }, () => 'palabra').join(' '))).toBe(5);
  });
});

describe('summarize', () => {
  it('keeps short texts and normalizes whitespace', () => {
    expect(summarize('  Hola\n\nmundo  ')).toBe('Hola mundo');
  });

  it('cuts at a whole word and adds an ellipsis', () => {
    const text =
      'El aumento del alquiler se calcula con el índice que fija el contrato, mes a mes.';
    const summary = summarize(text, 40);
    expect(summary.length).toBeLessThanOrEqual(40);
    expect(summary).toBe('El aumento del alquiler se calcula con…');
  });
});
