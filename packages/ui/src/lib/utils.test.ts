import { describe, expect, it } from 'vitest';

import { cn, escapeHtml } from './utils';

describe('cn', () => {
  it('joins conditional classes', () => {
    expect(cn('a', undefined, null, { b: false, c: true })).toBe('a c');
  });

  it('lets the last conflicting Tailwind class win', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });

  it('keeps the custom text-md size next to a text color', () => {
    expect(cn('text-md', 'text-muted-foreground')).toBe('text-md text-muted-foreground');
  });

  it('keeps the custom shadow-3xl next to a radius', () => {
    expect(cn('rounded-xl shadow-3xl', 'rounded-lg')).toBe('shadow-3xl rounded-lg');
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that open markup or attributes', () => {
    expect(escapeHtml(`<img src="x" onerror='a()'>&`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;a()&#39;&gt;&amp;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Depto 2 amb. en Palermo')).toBe('Depto 2 amb. en Palermo');
  });
});
