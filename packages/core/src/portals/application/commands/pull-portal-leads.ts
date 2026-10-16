import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { PortalInputSchema, type PortalInput } from '../../contracts';
import { PORTAL_CATALOG } from '../../domain/portal';
import { leadInquiry, type PortalLead } from '../../domain/portal-lead';
import type { PortalNotConfiguredError, PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalLeadSink, PortalLeadSource } from '../ports/portal-leads';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type PullPortalLeadsError =
  ForbiddenError | ValidationFailedError | PortalNotConfiguredError | PortalUnavailableError;

/** Cómo terminó: cuántos contactos entraron, cuántos ya estaban y cuántos no se tomaron. */
export interface PullPortalLeadsOutcome {
  readonly received: number;
  readonly duplicates: number;
  /** Sin teléfono ni email (un anónimo que tocó "Ver teléfono"): no entran. */
  readonly skipped: number;
  /** La bandeja los rechazó (un teléfono o un email inválidos). */
  readonly rejected: number;
}

/** Días hacia atrás que se leen: cubren un corte del portal o del job sin guardar un cursor. */
export const LEADS_LOOKBACK_DAYS = 2;
const PAGE_SIZE = 100;
/** Tope de páginas por corrida: miles de contactos en dos días no son de una inmobiliaria. */
const MAX_PAGES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const NOTHING: PullPortalLeadsOutcome = { received: 0, duplicates: 0, skipped: 0, rejected: 0 };

/**
 * Trae a la bandeja de consultas los contactos que llegaron por los avisos del portal: los de los
 * últimos días, leídos del portal (no de lo que mande un aviso). La bandeja no duplica una consulta
 * que ya tiene, así que se puede correr seguido. La consulta queda con su propiedad si el aviso es
 * de Norde. Lo corre un job (cada 10 minutos, o cuando el portal avisa).
 */
export class PullPortalLeads {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly source: PortalLeadSource;
      readonly sink: PortalLeadSink;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: PortalInput,
    actor: Actor,
  ): Promise<Result<PullPortalLeadsOutcome, PullPortalLeadsError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PortalInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal } = parsed.value;
    const channel = PORTAL_CATALOG[portal].leadChannel;
    if (channel === undefined) return ok(NOTHING);

    const account = await this.deps.uow.run((tx) => tx.accounts.get(portal));
    const connection = account.toSnapshot().connection;
    // Sin cuenta conectada no hay de dónde leer: no es un error del job.
    if (!connection) return ok(NOTHING);

    const since = new Date(this.deps.clock.now().getTime() - LEADS_LOOKBACK_DAYS * DAY_MS);
    const totals = { received: 0, duplicates: 0, skipped: 0, rejected: 0 };
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const slice = await this.deps.source.recent({
        portal,
        externalAccountId: connection.externalAccountId,
        since,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      if (slice.isErr()) return err(slice.error);
      const leads = slice.value.items;
      const properties = await this.#propertiesOf(portal, leads);

      for (const lead of leads) {
        const inquiry = leadInquiry(lead);
        if (!inquiry) {
          totals.skipped += 1;
          continue;
        }
        const received = await this.deps.sink.receive({
          channel,
          ...inquiry,
          propertyId: lead.listingCode === undefined ? undefined : properties.get(lead.listingCode),
        });
        if (received.isErr()) totals.rejected += 1;
        else if (received.value.duplicate) totals.duplicates += 1;
        else totals.received += 1;
      }

      const seen = page * PAGE_SIZE + leads.length;
      if (leads.length < PAGE_SIZE || seen >= slice.value.total) break;
    }
    return ok(totals);
  }

  /** La propiedad de cada aviso de Norde, por el código con que lo maneja. */
  async #propertiesOf(
    portal: PortalInput['portal'],
    leads: readonly PortalLead[],
  ): Promise<ReadonlyMap<string, string>> {
    const codes = [
      ...new Set(leads.flatMap((l) => (l.listingCode === undefined ? [] : [l.listingCode]))),
    ];
    if (codes.length === 0) return new Map();
    const listings = await this.deps.uow.run((tx) => tx.listings.findByExternalIds(portal, codes));
    return new Map(
      listings.flatMap((l) => {
        const { externalId } = l.toSnapshot();
        return externalId === undefined ? [] : [[externalId, l.propertyId] as const];
      }),
    );
  }
}
