import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import type { InquirySourceCounts } from '../../contracts';
import { countBySource } from '../../domain/inquiry-source';
import { canReadInquiries } from '../inquiry-support';
import type { InquiryInboxQuery } from '../ports/inquiry-inbox-query';

export type CountInquiriesBySourceError = ForbiddenError;

// Buenos Aires es UTC−3 todo el año (sin horario de verano desde 2009).
const BUENOS_AIRES_OFFSET_MS = 3 * 60 * 60 * 1000;

/** El mes `AAAA-MM` de Buenos Aires del instante, con su comienzo y el del siguiente (UTC). */
function currentMonth(now: Date): {
  readonly month: string;
  readonly from: Date;
  readonly to: Date;
} {
  const local = new Date(now.getTime() - BUENOS_AIRES_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    month: local.toISOString().slice(0, 7),
    from: new Date(Date.UTC(year, month, 1) + BUENOS_AIRES_OFFSET_MS),
    to: new Date(Date.UTC(year, month + 1, 1) + BUENOS_AIRES_OFFSET_MS),
  };
}

/**
 * Cuántas consultas entraron en el mes en curso por cada origen (Mercado Libre, Zonaprop, agente de
 * IA web, bot de WhatsApp y otros), sin las borradas: los indicadores de arriba de la bandeja. No
 * dependen de los filtros de la bandeja.
 */
export class CountInquiriesBySource {
  constructor(
    private readonly deps: { readonly inbox: InquiryInboxQuery; readonly clock: Clock },
  ) {}

  async execute(actor: Actor): Promise<Result<InquirySourceCounts, CountInquiriesBySourceError>> {
    if (!canReadInquiries(actor)) return err({ type: 'Forbidden' });

    const { month, from, to } = currentMonth(this.deps.clock.now());
    const byChannel = await this.deps.inbox.countByChannel({ from, to });
    return ok({ month, counts: countBySource(byChannel) });
  }
}
