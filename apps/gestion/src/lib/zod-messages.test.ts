import { RegisterContactInputSchema } from '@norde/core/clients/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { configureZodMessages } from './zod-messages';

configureZodMessages();

function firstMessage(schema: z.ZodType, input: unknown): string | undefined {
  return schema.safeParse(input).error?.issues[0]?.message;
}

describe('spanish validation messages', () => {
  it('asks to fill a required field', () => {
    expect(firstMessage(z.object({ name: z.string() }), {})).toBe('Completá este campo.');
    expect(firstMessage(z.string().trim().min(1), '  ')).toBe('Completá este campo.');
  });

  it('states the minimum and maximum length', () => {
    expect(firstMessage(z.string().min(8), 'abc')).toBe('Tiene que tener al menos 8 caracteres.');
    expect(firstMessage(z.string().max(120), 'a'.repeat(121))).toBe(
      'Puede tener hasta 120 caracteres.',
    );
  });

  it('states numeric bounds', () => {
    expect(firstMessage(z.int().min(0), -1)).toBe('Tiene que ser como mínimo 0.');
    expect(firstMessage(z.number().lt(10), 10)).toBe('Tiene que ser menor que 10.');
  });

  it('asks for a valid option and a valid email', () => {
    expect(firstMessage(z.enum(['sale', 'rent']), 'other')).toBe('Elegí una opción válida.');
    expect(firstMessage(z.email(), 'ana@')).toBe('Ingresá un email válido.');
  });

  it('applies to the core contracts', () => {
    const result = RegisterContactInputSchema.safeParse({
      channel: 'whatsapp',
      channelExternalId: '',
      opportunity: { type: 'sale', intent: 'info' },
    });
    expect(result.error?.issues[0]?.message).toBe('Completá este campo.');
  });
});
