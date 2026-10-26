import { describe, expect, it } from 'vitest';

import { compactMemory, trimMemory } from './memory';

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

describe('compactMemory', () => {
  const reasoning = { type: 'reasoning', id: 'rs_1' };
  const result = (text: string) => ({
    type: 'function_call_result',
    name: 'search_properties',
    callId: 'c1',
    output: { type: 'text', text },
  });

  it('keeps the last turns whole and compacts the older ones', () => {
    const memory = [
      userMessage('1'),
      reasoning,
      call,
      result('{"items":[]}'),
      reply,
      userMessage('2'),
      reasoning,
      reply,
    ];

    const compacted = compactMemory(memory, {
      fullTurns: 1,
      compactToolOutput: (name, text) => `${name}:${text.length}`,
    });

    expect(compacted).toEqual([
      userMessage('1'),
      call,
      { ...result('{"items":[]}'), output: { type: 'text', text: 'search_properties:12' } },
      reply,
      userMessage('2'),
      reasoning,
      reply,
    ]);
  });

  it('leaves a memory with fewer turns untouched', () => {
    const memory = [userMessage('1'), reasoning, reply];

    expect(compactMemory(memory, { fullTurns: 2 })).toBe(memory);
  });
});
