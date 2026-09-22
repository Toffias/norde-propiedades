import { describe, expect, it } from 'vitest';

import { err, ok, type Result } from './result';

interface ParseError {
  readonly type: 'NotANumber';
  readonly raw: string;
}

function parse(raw: string): Result<number, ParseError> {
  const value = Number(raw);
  return Number.isNaN(value) ? err({ type: 'NotANumber', raw }) : ok(value);
}

describe('Result', () => {
  it('narrows to the value on Ok', () => {
    const result = parse('42');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe(42);
  });

  it('narrows to the typed error on Err', () => {
    const result = parse('abc');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toEqual({ type: 'NotANumber', raw: 'abc' });
  });

  it('maps only the Ok branch', () => {
    expect(
      parse('2')
        .map((n) => n * 10)
        .unwrapOr(0),
    ).toBe(20);
    expect(
      parse('x')
        .map((n) => n * 10)
        .unwrapOr(0),
    ).toBe(0);
  });

  it('maps only the Err branch', () => {
    const mapped = parse('x').mapErr((e) => e.type);

    expect(mapped.isErr() && mapped.error).toBe('NotANumber');
    expect(
      parse('1')
        .mapErr((e) => e.type)
        .unwrapOr(0),
    ).toBe(1);
  });

  it('chains operations with andThen and short-circuits on the first Err', () => {
    const positive = (n: number): Result<number, { readonly type: 'NotPositive' }> =>
      n > 0 ? ok(n) : err({ type: 'NotPositive' });

    expect(parse('5').andThen(positive).unwrapOr(-1)).toBe(5);

    const negative = parse('-5').andThen(positive);
    expect(negative.isErr() && negative.error).toEqual({ type: 'NotPositive' });

    const invalid = parse('x').andThen(positive);
    expect(invalid.isErr() && invalid.error).toEqual({ type: 'NotANumber', raw: 'x' });
  });

  it('exposes a discriminant for exhaustive checks', () => {
    expect(parse('1').ok).toBe(true);
    expect(parse('x').ok).toBe(false);
  });
});
