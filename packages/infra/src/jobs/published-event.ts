import { z } from 'zod';

/** Evento de dominio tal como sale del outbox y viaja en un job. */
export interface PublishedEvent {
  /** ID de la fila del outbox: también es el ID del job (idempotencia). */
  readonly id: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: unknown;
}

export const PublishedEventJobSchema = z.object({
  id: z.uuid(),
  type: z.string().min(1),
  aggregateId: z.string(),
  occurredAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  payload: z.unknown(),
});

export function toJobData(event: PublishedEvent): Record<string, unknown> {
  return { ...event, occurredAt: event.occurredAt.toISOString() };
}
