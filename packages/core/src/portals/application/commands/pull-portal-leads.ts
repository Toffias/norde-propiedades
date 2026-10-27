import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { PortalInputSchema, type PortalInput } from '../../contracts';
import { PORTAL_CATALOG } from '../../domain/portal';
import { leadInquiry, type PortalLead } from '../../domain/portal-lead';
import type { ListingOwner } from '../../domain/listing';
import type { PortalNotConfiguredError, PortalUnavailableError } from '../ports/portal-authorizer';
import type { PropertyCodeLookup } from '../ports/portal-listing-catalog';
import type { PortalLeadSink, PortalLeadSource } from '../ports/portal-leads';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type PullPortalLeadsError =
  ForbiddenError | ValidationFailedError | PortalNotConfiguredError | PortalUnavailableError;

/** Una consulta que la bandeja rechazó: el ID del contacto en el portal y el motivo, sin sus datos. */
export interface RejectedPortalLead {
  readonly externalId: string;
  readonly reason: string;
}

/** Cómo terminó: cuántos contactos entraron, cuántos ya estaban y cuántos no se tomaron. */
export interface PullPortalLeadsOutcome {
  readonly received: number;
  readonly duplicates: number;
  /** Sin teléfono ni email (un anónimo que tocó "Ver teléfono"): no entran. */
  readonly skipped: number;
  /** La bandeja los rechazó (sin un teléfono ni un email válidos). */
  readonly rejected: number;
  readonly rejections: readonly RejectedPortalLead[];
}

const PAGE_SIZE = 100;
/** Tope de páginas por corrida: miles de contactos en dos semanas no son de una inmobiliaria. */
const MAX_PAGES = 20;

const NOTHING: PullPortalLeadsOutcome = {
  received: 0,
  duplicates: 0,
  skipped: 0,
  rejected: 0,
  rejections: [],
};

/**
 * Trae a la bandeja de consultas los contactos que llegaron por los avisos del portal: los de los
 * últimos días (o desde la última lectura completa, si fue antes), leídos del portal (no de lo que
 * mande un aviso). La bandeja no duplica una consulta que ya tiene, así que se puede correr seguido.
 * La consulta queda con su propiedad si el aviso es de Norde, o si su clave interna es el código de
 * una propiedad (los avisos de Tokko que todavía no se vincularon). Lo corre un job (cada 10
 * minutos, o cuando el portal avisa).
 */
export class PullPortalLeads {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly source: PortalLeadSource;
      readonly sink: PortalLeadSink;
      readonly properties: PropertyCodeLookup;
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

    const startedAt = this.deps.clock.now();
    const since = account.leadsSince(startedAt);
    const totals = { received: 0, duplicates: 0, skipped: 0, rejected: 0 };
    const rejections: RejectedPortalLead[] = [];
    let complete = false;
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
      const owners = await this.#ownersOf(portal, leads);
      const referenced = await this.#propertiesByReference(leads, owners);

      for (const lead of leads) {
        const inquiry = leadInquiry(lead);
        if (!inquiry) {
          totals.skipped += 1;
          continue;
        }
        const received = await this.deps.sink.receive({
          channel,
          ...inquiry,
          ...this.#about(lead, owners, referenced),
        });
        if (received.isErr()) {
          totals.rejected += 1;
          rejections.push({ externalId: lead.externalId, reason: received.error.reason });
        } else if (received.value.duplicate) totals.duplicates += 1;
        else totals.received += 1;
      }

      const seen = page * PAGE_SIZE + leads.length;
      if (leads.length < PAGE_SIZE || seen >= slice.value.total) {
        complete = true;
        break;
      }
    }

    // Solo una lectura completa mueve el cursor: si se cortó por el tope, la próxima lee lo mismo.
    if (complete) {
      await this.deps.uow.run(async (tx) => {
        const current = await tx.accounts.get(portal);
        current.recordLeadsPulled(startedAt);
        await tx.accounts.save(current, actor.id);
      });
    }
    return ok({ ...totals, rejections });
  }

  /**
   * De qué es la consulta: la unidad por la que llegó, la propiedad o el emprendimiento del aviso, o
   * la propiedad cuyo código es la clave interna del aviso.
   */
  #about(
    lead: PortalLead,
    owners: ReadonlyMap<string, ListingOwner>,
    referenced: ReadonlyMap<string, string>,
  ): { readonly propertyId: string | undefined; readonly developmentId: string | undefined } {
    if (lead.unitPropertyId !== undefined) {
      return { propertyId: lead.unitPropertyId, developmentId: undefined };
    }
    const owner = lead.listingCode === undefined ? undefined : owners.get(lead.listingCode);
    if (owner) {
      return {
        propertyId: owner.kind === 'property' ? owner.id : undefined,
        developmentId: owner.kind === 'development' ? owner.id : undefined,
      };
    }
    const propertyId = referenceCandidates(lead.listingReference)
      .map((code) => referenced.get(code))
      .find((id) => id !== undefined);
    return { propertyId, developmentId: undefined };
  }

  /**
   * Las propiedades de los avisos que Norde no maneja, por su clave interna: el código de la
   * propiedad con que los cargó otro sistema.
   */
  async #propertiesByReference(
    leads: readonly PortalLead[],
    owners: ReadonlyMap<string, ListingOwner>,
  ): Promise<ReadonlyMap<string, string>> {
    const codes = [
      ...new Set(
        leads.flatMap((l) =>
          l.unitPropertyId !== undefined ||
          (l.listingCode !== undefined && owners.has(l.listingCode))
            ? []
            : referenceCandidates(l.listingReference),
        ),
      ),
    ];
    if (codes.length === 0) return new Map();
    const properties = await this.deps.properties.byCodes(codes);
    return new Map(properties.map((p) => [p.code, p.propertyId]));
  }

  /** De qué es cada aviso de Norde, por el código con que lo maneja. */
  async #ownersOf(
    portal: PortalInput['portal'],
    leads: readonly PortalLead[],
  ): Promise<ReadonlyMap<string, ListingOwner>> {
    const codes = [
      ...new Set(leads.flatMap((l) => (l.listingCode === undefined ? [] : [l.listingCode]))),
    ];
    if (codes.length === 0) return new Map();
    const listings = await this.deps.uow.run((tx) => tx.listings.findByExternalIds(portal, codes));
    return new Map(
      listings.flatMap((l) => {
        const { externalId } = l.toSnapshot();
        return externalId === undefined ? [] : [[externalId, l.owner] as const];
      }),
    );
  }
}

/**
 * Los códigos de propiedad que puede ser una clave interna: ella misma y, si trae varios tramos
 * (`NCO13274 AP2215950`, una unidad en Tokko), el último.
 */
function referenceCandidates(reference: string | undefined): readonly string[] {
  if (reference === undefined) return [];
  const last = reference.split(/\s+/).at(-1);
  return last !== undefined && last !== reference ? [reference, last] : [reference];
}
