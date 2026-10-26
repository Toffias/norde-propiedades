import { z } from 'zod';

/** `InputModeration` de `@norde/agent-kit`: `true` si el mensaje se frena. */
type InputModeration = (text: string) => Promise<boolean>;

const ModerationResponseSchema = z.object({
  results: z.array(z.object({ flagged: z.boolean() })),
});

/**
 * Moderación de OpenAI (`omni-moderation-latest`, sin costo). Si la API falla, deja pasar el
 * mensaje y avisa por `onError`: el agente ya tiene sus propios límites en el prompt.
 */
export function openAIModeration(options: {
  readonly apiKey: string;
  readonly onError: (error: unknown) => void;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}): InputModeration {
  const fetchImpl = options.fetch ?? fetch;
  return async (text) => {
    try {
      const response = await fetchImpl(
        `${options.baseUrl ?? 'https://api.openai.com/v1'}/moderations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: options.model ?? 'omni-moderation-latest', input: text }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error(`OpenAI moderation responded ${response.status}`);
      const parsed = ModerationResponseSchema.parse(await response.json());
      return parsed.results.some((result) => result.flagged);
    } catch (error) {
      options.onError(error);
      return false;
    }
  };
}
