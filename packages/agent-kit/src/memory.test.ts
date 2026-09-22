import { describe, expect, it } from 'vitest';

import { trimMemory } from './memory';

const userMessage = (content: string) => ({ role: 'user', content });
const call = { type: 'function_call', name: 'search_properties', callId: 'c1' };
const output = { type: 'function_call_result', callId: 'c1' };
const reply = { role: 'assistant', content: 'ok' };

describe('trimMemory', () => {
  it('keeps short memories untouched', () => {
    const memory = [userMessage('hola'), reply];

    expect(trimMemory(memory, 10)).toBe(memory);
  });

  it('starts at a user message so a tool call never loses its result', () => {
    const memory = [userMessage('1'), call, output, reply, userMessage('2'), call, output, reply];

    const trimmed = trimMemory(memory, 6);

    expect(trimmed).toEqual([userMessage('2'), call, output, reply]);
  });

  it('can end up empty if no user message fits', () => {
    expect(trimMemory([userMessage('1'), call, output, reply], 2)).toEqual([]);
  });
});
