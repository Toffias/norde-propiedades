import type {
  PortalId,
  PortalLead,
  PortalLeadKind,
  PortalLeadNotifications,
  PortalLeadSource,
  PortalNotConfiguredError,
  PortalUnavailableError,
} from '@norde/core/portals';
import { err, ok, type PageSlice, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

import type { ZonapropApi, ZonapropApiError } from './zonaprop-api';
import { unitPropertyId } from './zonaprop-development';

const MessageSchema = z.object({
  id: z.union([z.number(), z.string()]).nullish(),
  idMensaje: z.union([z.number(), z.string()]).nullish(),
  idContactoAccion: z.number().nullish(),
  codigoAviso: z.string().nullish(),
  nombre: z.string().nullish(),
  email: z.string().nullish(),
  telefono: z.string().nullish(),
  textoMensaje: z.string().nullish(),
  fecha: z.string().nullish(),
});

const MessagePageSchema = z.object({
  total: z.number().int().nonnegative(),
  content: z.array(MessageSchema),
});

/** Los tipos de contacto de Open Navent (`idContactoAccion`), comunes a todos los idiomas. */
const KINDS: Readonly<Record<number, PortalLeadKind>> = {
  1: 'message',
  2: 'call_me',
  3: 'visit',
  6: 'contact_data',
  10: 'whatsapp',
  12: 'appraisal',
  15: 'visit',
};

/** Las suscripciones que traen contactos: el de "ver teléfono" y el de mensaje. */
const LEAD_EVENTS = ['CONTACTO', 'CONTACTO_MENSAJE'] as const;

function blank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

/** `yyyyMMdd`, el formato de `fromDate`, en la fecha de Buenos Aires. */
function fromDate(date: Date): string {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return local.replaceAll('-', '');
}

function receivedAt(value: string | null | undefined): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readError(error: ZonapropApiError): PortalNotConfiguredError | PortalUnavailableError {
  return error.type === 'not_configured' || error.type === 'forbidden'
    ? { type: 'PortalNotConfigured' }
    : { type: 'PortalUnavailable' };
}

function toLead(message: z.infer<typeof MessageSchema>): PortalLead | undefined {
  const id = message.idMensaje ?? message.id;
  if (id === undefined || id === null) return undefined;
  const code = blank(message.codigoAviso);
  return {
    externalId: String(id),
    kind: KINDS[message.idContactoAccion ?? 1] ?? 'other',
    receivedAt: receivedAt(message.fecha),
    name: blank(message.nombre),
    email: blank(message.email),
    phone: blank(message.telefono),
    message: blank(message.textoMensaje),
    listingCode: code,
    // Una unidad de un emprendimiento de Norde: su código es el de la propiedad.
    unitPropertyId: code === undefined ? undefined : unitPropertyId(code),
  };
}

/**
 * Los contactos de los avisos de la inmobiliaria en Zonaprop (`/v2/inmobiliarias/{codigo}/mensajes`,
 * paginado por Zonaprop), y las suscripciones a sus avisos (callbacks). Nunca loguea datos del
 * contacto: solo cuántos llegaron.
 */
export class ZonapropLeads implements PortalLeadSource, PortalLeadNotifications {
  constructor(private readonly deps: { readonly api: ZonapropApi; readonly logger: InfraLogger }) {}

  async recent(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly since: Date;
    readonly offset: number;
    readonly limit: number;
  }): Promise<Result<PageSlice<PortalLead>, PortalNotConfiguredError | PortalUnavailableError>> {
    if (input.portal !== 'zonaprop') return err({ type: 'PortalNotConfigured' });
    const query = new URLSearchParams({
      fromDate: fromDate(input.since),
      'pageable.page': String(Math.floor(input.offset / input.limit)),
      'pageable.size': String(input.limit),
    });
    const agency = encodeURIComponent(input.externalAccountId);
    const result = await this.deps.api.get(
      `/v2/inmobiliarias/${agency}/mensajes?${query.toString()}`,
      MessagePageSchema,
    );
    if (result.isErr()) return err(readError(result.error));
    const page = result.value ?? { total: 0, content: [] };
    const items = page.content.flatMap((m) => {
      const lead = toLead(m);
      return lead ? [lead] : [];
    });
    this.deps.logger.info(
      { portal: input.portal, count: items.length, total: page.total },
      'Zonaprop leads read',
    );
    return ok({ items, total: page.total });
  }

  async subscribe(input: {
    readonly portal: PortalId;
    readonly url: string;
    readonly headerName: string;
    readonly headerValue: string;
  }): Promise<Result<void, PortalNotConfiguredError | PortalUnavailableError>> {
    if (input.portal !== 'zonaprop') return err({ type: 'PortalNotConfigured' });
    const configured = await this.deps.api.send('/v1/configuracion/callbacks', {
      url: input.url,
      authorizationHeaderKey: input.headerName,
      authorizationHeaderValue: input.headerValue,
      lenguajeCallbackBody: 'ES',
    });
    if (configured.isErr()) return err(readError(configured.error));
    for (const event of LEAD_EVENTS) {
      const subscribed = await this.deps.api.send(
        `/v1/configuracion/callbacks/${event}`,
        undefined,
      );
      if (subscribed.isErr()) return err(readError(subscribed.error));
    }
    this.deps.logger.info({ portal: input.portal }, 'Zonaprop lead callbacks configured');
    return ok(undefined);
  }
}
