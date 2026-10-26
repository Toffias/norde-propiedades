/**
 * Decide si un mensaje del usuario se frena antes de llegar al modelo (`true` = se frena). La
 * implementación (moderación de OpenAI) vive en `@norde/infra`.
 */
export type InputModeration = (text: string) => Promise<boolean>;
