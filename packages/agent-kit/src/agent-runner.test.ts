import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AgentRunner } from './agent-runner';
import { defineTool } from './agent-tool';
import { assistantMessage, functionCall, modelError, ScriptedModel } from './testing';

interface Context {
  readonly calls: string[];
}

const echo = defineTool<Context, z.ZodObject<{ text: z.ZodString }>>({
  name: 'echo',
  description: 'Repite el texto',
  parameters: z.object({ text: z.string() }),
  execute: ({ text }, context) => {
    context.calls.push(text);
    return Promise.resolve({ echoed: text, cents: 150n });
  },
});

function runnerWith(model: ScriptedModel, overrides: { onToolError?: () => void } = {}) {
  return new AgentRunner<Context>({
    name: 'Test',
    model: { instance: model },
    instructions: () => 'Sos un agente de prueba.',
    tools: [
      echo,
      defineTool<Context, z.ZodObject>({
        name: 'broken',
        description: 'Siempre falla',
        parameters: z.object({}),
        execute: () => Promise.reject(new Error('boom')),
      }),
    ],
    maxMemoryItems: 10,
    ...overrides,
  });
}

describe('AgentRunner', () => {
  it('runs tools with the turn context and returns the final text and memory', async () => {
    const model = new ScriptedModel([
      [functionCall('echo', { text: 'hola' }, { callId: 'call-1' })],
      [assistantMessage('Listo')],
    ]);
    const context: Context = { calls: [] };

    const result = await runnerWith(model).run({ memory: [], userText: 'decí hola', context });

    expect(result.ok && result.text).toBe('Listo');
    expect(result.ok && result.toolCalls).toEqual(['echo']);
    expect(context.calls).toEqual(['hola']);
    // bigint se serializa como texto en la salida de la tool.
    expect(JSON.stringify(result.ok && result.memory)).toContain('\\"cents\\":\\"150\\"');
    expect(result.ok && result.usage.requests).toBe(2);
  });

  it('sends the previous memory to the model', async () => {
    const model = new ScriptedModel([[assistantMessage('Primero')], [assistantMessage('Segundo')]]);
    const runner = runnerWith(model);
    const first = await runner.run({ memory: [], userText: 'uno', context: { calls: [] } });
    if (!first.ok) throw new Error('unexpected');

    await runner.run({ memory: first.memory, userText: 'dos', context: { calls: [] } });

    expect(JSON.stringify(model.lastCall?.request.input)).toContain('Primero');
  });

  it('reports tool errors and lets the model continue', async () => {
    const errors: unknown[] = [];
    const model = new ScriptedModel([
      [functionCall('broken', {}, { callId: 'call-1' })],
      [assistantMessage('Hubo un problema')],
    ]);

    const result = await runnerWith(model, { onToolError: () => errors.push('broken') }).run({
      memory: [],
      userText: 'probá',
      context: { calls: [] },
    });

    expect(result.ok && result.text).toBe('Hubo un problema');
    expect(errors).toEqual(['broken']);
  });

  it('returns a failure when the model fails', async () => {
    const model = new ScriptedModel([modelError(new Error('401 invalid api key'))]);

    const result = await runnerWith(model).run({
      memory: [],
      userText: 'hola',
      context: { calls: [] },
    });

    expect(result.ok).toBe(false);
  });

  it('leaves headroom for reasoning and bounds cost with the effort (MVP lesson)', () => {
    const runner = runnerWith(new ScriptedModel());

    expect(runner.modelSettings.maxTokens).toBeGreaterThanOrEqual(2000);
    expect(runner.modelSettings.reasoningEffort).toBe('low');
  });
});
