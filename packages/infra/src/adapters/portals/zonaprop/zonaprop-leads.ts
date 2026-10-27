import type {
  PortalId,
  PortalLead,
  PortalListingCatalog,
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
  idAvisoNavplat: z.union([z.number(), z.string()]).nullish(),
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

/** Termina en `Z` o en un offset (`-03:00`, `-0300`). */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * `fecha`: con offset, tal cual; sin offset (`2026-10-16T12:30:00`), es hora de Buenos Aires (UTC-3
 * todo el año), no la del servidor.
 */
export function receivedAt(value: string | null | undefined): Date | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') return undefined;
  const dated = trimmed.includes('T') && !HAS_OFFSET.test(trimmed) ? `${trimmed}-03:00` : trimmed;
  const parsed = new Date(dated);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

const LISTING_CODE = /^[0-9a-f]{32}$/i;

/**
 * El código del aviso como lo guarda Norde: los suyos (el ID de la publicación o de la unidad) en
 * minúsculas, por si el portal los devuelve normalizados. Los de otros sistemas, tal cual.
 */
function nordeCode(code: string | undefined): string | undefined {
  if (code === undefined) return undefined;
  if (LISTING_CODE.test(code)) return code.toLowerCase();
  if (unitPropertyId(code) !== undefined) return `U${code.slice(1).toLowerCase()}`;
  return code;
}

function isNordeCode(code: string | undefined): boolean {
  return code !== undefined && (LISTING_CODE.test(code) || unitPropertyId(code) !== undefined);
}

/** Cuántas claves internas se recuerdan: más que los avisos online de una inmobiliaria. */
const MAX_REFERENCES = 5000;

function readError(error: ZonapropApiError): PortalNotConfiguredError | PortalUnavailableError {
  return error.type === 'not_configured' || error.type === 'forbidden'
    ? { type: 'PortalNotConfigured' }
    : { type: 'PortalUnavailable' };
}

function toLead(
  message: z.infer<typeof MessageSchema>,
  references: ReadonlyMap<string, string | undefined>,
): PortalLead | undefined {
  const id = message.idMensaje ?? message.id;
  if (id === undefined || id === null) return undefined;
  const code = nordeCode(blank(message.codigoAviso));
  const remoteId = remoteIdOf(message);
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
    listingReference: remoteId === undefined ? undefined : references.get(remoteId),
  };
}

/** El aviso en el portal (`idAvisoNavplat`) de un contacto que no es de un aviso de Norde. */
function remoteIdOf(message: z.infer<typeof MessageSchema>): string | undefined {
  if (isNordeCode(blank(message.codigoAviso))) return undefined;
  const remoteId = message.idAvisoNavplat;
  return remoteId === undefined || remoteId === null ? undefined : String(remoteId);
}

/**
 * Los contactos de los avisos de la inmobiliaria en Zonaprop (`/v2/inmobiliarias/{codigo}/mensajes`,
 * paginado por Zonaprop), y las suscripciones a sus avisos (callbacks). Nunca loguea datos del
 * contacto: solo cuántos llegaron.
 *
 * Un contacto de un aviso que Norde todavía no maneja (uno de Tokko sin vincular) trae la clave
 * interna del aviso, leída del resumen de avisos online por su `idAvisoNavplat`. Se recuerda: la
 * clave de un aviso no cambia, y cada lectura vuelve a traer los contactos de los últimos días.
 */
export class ZonapropLeads implements PortalLeadSource, PortalLeadNotifications {
  readonly #references = new Map<string, string | undefined>();

  constructor(
    private readonly deps: {
      readonly api: ZonapropApi;
      readonly catalog: Pick<PortalListingCatalog, 'online'>;
      readonly logger: InfraLogger;
    },
  ) {}

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
    const references = await this.#referencesOf(input.externalAccountId, page.content);
    if (references.isErr()) return err(references.error);
    const items = page.content.flatMap((m) => {
      const lead = toLead(m, references.value);
      return lead ? [lead] : [];
    });
    this.deps.logger.info(
      { portal: input.portal, count: items.length, total: page.total },
      'Zonaprop leads read',
    );
    return ok({ items, total: page.total });
  }

  /** La clave interna de cada aviso ajeno de la página, del resumen de avisos online. */
  async #referencesOf(
    externalAccountId: string,
    messages: readonly z.infer<typeof MessageSchema>[],
  ): Promise<
    Result<
      ReadonlyMap<string, string | undefined>,
      PortalNotConfiguredError | PortalUnavailableError
    >
  > {
    const remoteIds = new Set(messages.flatMap((m) => remoteIdOf(m) ?? []));
    for (const remoteId of remoteIds) {
      if (this.#references.has(remoteId)) continue;
      const listing = await this.deps.catalog.online({
        portal: 'zonaprop',
        externalAccountId,
        offset: 0,
        limit: 1,
        remoteId,
      });
      if (listing.isErr()) return err(listing.error);
      if (this.#references.size >= MAX_REFERENCES) this.#references.clear();
      // Un aviso que ya no está online no tiene resumen: se recuerda sin clave.
      this.#references.set(remoteId, listing.value.items[0]?.reference);
    }
    return ok(this.#references);
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
