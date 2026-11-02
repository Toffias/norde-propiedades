import { z } from 'zod';

import type { ShownProperty } from './turn-context';

/** Cuántas se recuerdan: tres páginas de resultados. */
export const MAX_RECENT_PROPERTIES = 9;

/**
 * Una propiedad que el contacto vio en la charla. Se guarda en la conversación y sobrevive al
 * recorte y al reinicio de la memoria del agente, para resolver "la segunda" o "la que me
 * pasaste" aunque el agente ya no lo recuerde.
 */
const RecentPropertySchema = z.object({
  id: z.string().max(64),
  title: z.string().max(300),
  url: z.string().max(500),
});

export type RecentProperty = z.infer<typeof RecentPropertySchema>;

const RecentPropertiesSchema = z.array(RecentPropertySchema).max(MAX_RECENT_PROPERTIES);

/** Lo guardado en la conversación; si falta o no es válido, ninguna. */
export function parseRecentProperties(stored: unknown): readonly RecentProperty[] {
  const parsed = RecentPropertiesSchema.safeParse(stored);
  return parsed.success ? parsed.data : [];
}

/**
 * Las de este turno primero, en el orden en que se mostraron, y después las anteriores que no
 * se repitieron. Se queda con las más recientes.
 */
export function mergeRecentProperties(
  previous: readonly RecentProperty[],
  shown: Iterable<ShownProperty>,
): readonly RecentProperty[] {
  const current = [...shown].map(({ id, title, url }) => ({ id, title, url }));
  const ids = new Set(current.map((property) => property.id));
  return [...current, ...previous.filter((property) => !ids.has(property.id))].slice(
    0,
    MAX_RECENT_PROPERTIES,
  );
}
