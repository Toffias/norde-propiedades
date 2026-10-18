import type {
  PortalId,
  PortalLead,
  PortalLeadKind,
  PortalLeadSource,
  PortalNotConfiguredError,
  PortalUnavailableError,
} from '@norde/core/portals';
import { err, ok, type PageSlice, type Result } from '@norde/core/shared';
import { z } from 'zod';

import {
  MercadoLibreReads,
  type MercadoLibreReadError,
  type MercadoLibreReadsOptions,
} from './mercadolibre-reads';

export type MercadoLibreLeadsOptions = MercadoLibreReadsOptions;

type LeadsError = PortalNotConfiguredError | PortalUnavailableError;

/** Interesados por pedido: el máximo que se le pide a `/vis/users/{id}/leads/buyers`. */
const ML_PAGE_SIZE = 50;

const LeadSchema = z
  .object({
    id: z.string().min(1),
    contact_type: z.string().nullish(),
    channel: z.string().nullish(),
    created_at: z.string().nullish(),
    external_id: z.string().nullish(),
    item_id: z.string().nullish(),
  })
  .loose();

const BuyersSchema = z.object({
  results: z.array(
    z
      .object({
        item_id: z.string().nullish(),
        name: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        leads: z.array(LeadSchema).nullish(),
      })
      .loose(),
  ),
  paging: z.object({ total: z.number().int().nonnegative() }).loose(),
});

/** La cotización: la variación (unidad) que se cotizó, con el ID que le puso Norde. */
const QuotationSchema = z
  .object({
    variation: z.object({ seller_custom_field: z.string().nullish() }).loose().nullish(),
  })
  .loose();
const UnitIdSchema = z.uuid();

const QuestionSchema = z
  .object({ text: z.string().nullish(), status: z.string().nullish() })
  .loose();

/** El tipo de contacto de MercadoLibre (`contact_type`) en la bandeja. */
const KINDS: Readonly<Record<string, PortalLeadKind>> = {
  question: 'message',
  whatsapp: 'whatsapp',
  call: 'contact_data',
  contact_request: 'call_me',
  schedule: 'visit',
  visit_request: 'visit',
  quotation: 'quote',
};

/**
 * Los contactos de los avisos de una cuenta de MercadoLibre (leads de inmuebles), por HTTP y sin
 * SDK. Lee `/vis/users/{id}/leads/buyers` desde la fecha pedida: ML agrupa los contactos por
 * interesado y aviso, con su nombre, email y teléfono, y acá se aplanan (un contacto por lead). El
 * texto de una pregunta se lee de `/questions/{id}`, y la unidad de una cotización de un
 * emprendimiento, de `/quotations/{id}`. Los anónimos (`guest`) no se piden: no traen
 * cómo contactarlos. Nunca loguea datos del interesado.
 */
export class MercadoLibreLeads implements PortalLeadSource {
  readonly #api: MercadoLibreReads;

  constructor(options: MercadoLibreLeadsOptions) {
    this.#api = new MercadoLibreReads(options);
  }

  /**
   * Los contactos de los interesados `offset` a `offset + limit` (ML pagina por interesado). Si ML
   * devuelve menos de los pedidos por página, se sigue pidiendo hasta completar o llegar al total.
   */
  async recent(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly since: Date;
    readonly offset: number;
    readonly limit: number;
  }): Promise<Result<PageSlice<PortalLead>, LeadsError>> {
    const { portal, externalAccountId, since } = input;
    const path = `/vis/users/${encodeURIComponent(externalAccountId)}/leads/buyers`;
    const leads: PortalLead[] = [];
    let offset = input.offset;
    let total = 0;
    while (offset < input.offset + input.limit) {
      const query = new URLSearchParams({
        offset: String(offset),
        limit: String(Math.min(ML_PAGE_SIZE, input.offset + input.limit - offset)),
        date_from: since.toISOString().slice(0, 10),
      });
      const read = await this.#api.get(portal, `${path}?${query.toString()}`);
      if (read.isErr()) return err(portError(read.error));
      const parsed = BuyersSchema.safeParse(read.value);
      if (!parsed.success) {
        this.#api.unexpected(portal, path);
        return err({ type: 'PortalUnavailable' });
      }
      total = parsed.data.paging.total;

      for (const buyer of parsed.data.results) {
        for (const lead of buyer.leads ?? []) {
          const kind = KINDS[lead.contact_type ?? lead.channel ?? ''] ?? 'other';
          const message =
            kind === 'message' && lead.external_id
              ? await this.#question(portal, lead.external_id)
              : ok(undefined);
          if (message.isErr()) return err(portError(message.error));
          const unit =
            kind === 'quote' && lead.external_id
              ? await this.#quotedUnit(portal, lead.external_id)
              : ok(undefined);
          if (unit.isErr()) return err(portError(unit.error));
          const receivedAt = lead.created_at ? new Date(lead.created_at) : undefined;
          leads.push({
            externalId: lead.id,
            kind,
            receivedAt: receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : undefined,
            name: buyer.name ?? undefined,
            email: buyer.email ?? undefined,
            phone: buyer.phone ?? undefined,
            message: message.value,
            listingCode: lead.item_id ?? buyer.item_id ?? undefined,
            unitPropertyId: unit.value,
          });
        }
      }
      const returned = parsed.data.results.length;
      offset += returned;
      if (returned === 0 || offset >= total) break;
    }
    return ok({ items: leads, total });
  }

  /**
   * La unidad cotizada: la variación lleva el ID de la unidad en `seller_custom_field` (lo pone
   * Norde al publicar el emprendimiento). Sin él (un aviso de otro sistema), `undefined`.
   */
  async #quotedUnit(
    portal: PortalId,
    quotationId: string,
  ): Promise<Result<string | undefined, MercadoLibreReadError>> {
    const path = `/quotations/${encodeURIComponent(quotationId)}?caller.type=seller`;
    const read = await this.#api.get(portal, path, { notFound: true });
    if (read.isErr()) return err(read.error);
    const quotation = QuotationSchema.safeParse(read.value);
    const unitId = UnitIdSchema.safeParse(quotation.data?.variation?.seller_custom_field);
    return ok(unitId.success ? unitId.data : undefined);
  }

  /** El texto de la pregunta; sin texto (borrada o moderada), `undefined`. */
  async #question(
    portal: PortalId,
    questionId: string,
  ): Promise<Result<string | undefined, MercadoLibreReadError>> {
    const path = `/questions/${encodeURIComponent(questionId)}?api_version=4`;
    const read = await this.#api.get(portal, path, { notFound: true });
    if (read.isErr()) return err(read.error);
    const question = QuestionSchema.safeParse(read.value);
    if (!question.success || question.data.status === 'BANNED') return ok(undefined);
    const text = question.data.text?.trim();
    return ok(text === '' ? undefined : text);
  }
}

/** Sin credenciales, para la lectura de contactos es "el portal no está configurado". */
function portError(error: MercadoLibreReadError): LeadsError {
  return error.type === 'PortalCredentialsMissing' ? { type: 'PortalNotConfigured' } : error;
}
