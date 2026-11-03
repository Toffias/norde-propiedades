import type {
  PortalId,
  PortalListingCatalog,
  PortalNotConfiguredError,
  PortalSyncError,
  PortalUnavailableError,
  RemoteDevelopment,
  RemoteDevelopmentUnit,
  RemoteListing,
} from '@norde/core/portals';
import { err, ok, type PageSlice, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

import type { ZonapropApi, ZonapropApiError } from './zonaprop-api';
import { unitCode } from './zonaprop-development';
import { listingCode, listingPermalink } from './zonaprop-listing';
import { syncError } from './zonaprop-portal-connector';

const SummarySchema = z.object({
  idAvisoNavplat: z.union([z.number(), z.string()]),
  codigoAviso: z.string().nullish(),
  claveInterna: z.string().nullish(),
  titulo: z.string().nullish(),
  tipoDePublicacion: z.string().nullish(),
  tipoDeAviso: z.string().nullish(),
  idDesarrolloNavplat: z.union([z.number(), z.string()]).nullish(),
  ubicacion: z.object({ ubicacion: z.string().nullish() }).nullish(),
});

const SummaryPageSchema = z.object({
  total: z.number().int().nonnegative(),
  content: z.array(SummarySchema),
});

const UnitSummarySchema = z.object({
  idAvisoNavplat: z.union([z.number(), z.string()]),
  codigoAviso: z.string().nullish(),
  claveInterna: z.string().nullish(),
  titulo: z.string().nullish(),
});

const DevelopmentSummarySchema = SummarySchema.extend({
  unidades: z.array(UnitSummarySchema).nullish(),
});

/** `/desarrollos/online/resumen`: la página viene adentro de `content[].desarrollos`. */
const DevelopmentPageSchema = z.object({
  total: z.number().int().nonnegative(),
  content: z.array(z.object({ desarrollos: z.array(DevelopmentSummarySchema).nullish() })),
});

/** La respuesta de `asociar`: `code: 'ok'` si se vinculó. */
const LinkResponseSchema = z.object({
  code: z.string().nullish(),
  respuesta: z.string().nullish(),
  message: z.string().nullish(),
});

function blankToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function toRemote(summary: z.infer<typeof SummarySchema>): RemoteListing {
  const remoteId = String(summary.idAvisoNavplat);
  return {
    remoteId,
    code: blankToUndefined(summary.codigoAviso),
    reference: blankToUndefined(summary.claveInterna),
    title: blankToUndefined(summary.titulo) ?? `Aviso ${remoteId}`,
    // Un solo aviso con todas las operaciones; el plan dice la exposición.
    operation: undefined,
    listingType: undefined,
    plan: blankToUndefined(summary.tipoDePublicacion),
    location: blankToUndefined(summary.ubicacion?.ubicacion),
    permalink: listingPermalink(remoteId),
    // Un emprendimiento, o una unidad de uno.
    isDevelopment:
      (summary.tipoDeAviso !== undefined &&
        summary.tipoDeAviso !== null &&
        summary.tipoDeAviso !== 'AVISO_CLASIFICADO') ||
      (summary.idDesarrolloNavplat !== undefined && summary.idDesarrolloNavplat !== null),
  };
}

/**
 * El código de la propiedad de una unidad cargada por otro sistema: su clave interna o, en Tokko,
 * el último tramo del código del aviso (`DEV53838-NBU71286 AP8090293` → `AP8090293`).
 */
export function unitReference(unit: z.infer<typeof UnitSummarySchema>): string | undefined {
  const reference = blankToUndefined(unit.claveInterna);
  if (reference !== undefined) return reference;
  const code = blankToUndefined(unit.codigoAviso);
  return code?.includes(' ') ? code.split(/\s+/).at(-1) : undefined;
}

function toRemoteUnit(unit: z.infer<typeof UnitSummarySchema>): RemoteDevelopmentUnit {
  const remoteId = String(unit.idAvisoNavplat);
  return {
    remoteId,
    code: blankToUndefined(unit.codigoAviso),
    reference: unitReference(unit),
    title: blankToUndefined(unit.titulo) ?? `Unidad ${remoteId}`,
  };
}

function toRemoteDevelopment(summary: z.infer<typeof DevelopmentSummarySchema>): RemoteDevelopment {
  const remoteId = String(summary.idAvisoNavplat);
  return {
    remoteId,
    code: blankToUndefined(summary.codigoAviso),
    reference: blankToUndefined(summary.claveInterna),
    title: blankToUndefined(summary.titulo) ?? `Emprendimiento ${remoteId}`,
    plan: blankToUndefined(summary.tipoDePublicacion),
    location: blankToUndefined(summary.ubicacion?.ubicacion),
    permalink: listingPermalink(remoteId),
    units: (summary.unidades ?? []).map(toRemoteUnit),
  };
}

const NO_LINK_PERMISSION: PortalSyncError = {
  type: 'PortalRejected',
  reason:
    'Zonaprop no le da permiso a Norde para vincular avisos. Hay que pedirle a Zonaprop (integracion@ar.quintoandar.com) que habilite "asociar avisos" para el integrador.',
};

/** Avisos por página al buscar por clave interna: con 100, el sandbox responde 500. */
const REFERENCE_PAGE_SIZE = 50;
/** Hasta 2.000 avisos online: muchos más de los que tiene la inmobiliaria. */
const REFERENCE_MAX_PAGES = 40;
/** De a cuántos se relee una página que Zonaprop no pudo armar. */
const REFERENCE_RETRY_SIZE = 10;

function readError(error: ZonapropApiError): PortalNotConfiguredError | PortalUnavailableError {
  return error.type === 'not_configured' || error.type === 'forbidden'
    ? { type: 'PortalNotConfigured' }
    : { type: 'PortalUnavailable' };
}

/**
 * Los avisos y los emprendimientos online de la inmobiliaria en Zonaprop (`/avisos/online/resumen`
 * y `/desarrollos/online/resumen`, paginados por Zonaprop), y `asociar` para que Norde maneje uno
 * que publicó otro sistema, con su propio código.
 */
export class ZonapropListingCatalog implements PortalListingCatalog {
  constructor(private readonly deps: { readonly api: ZonapropApi; readonly logger: InfraLogger }) {}

  async online(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly offset: number;
    readonly limit: number;
    readonly remoteId?: string;
  }): Promise<Result<PageSlice<RemoteListing>, PortalNotConfiguredError | PortalUnavailableError>> {
    if (input.portal !== 'zonaprop') return err({ type: 'PortalNotConfigured' });
    const query = new URLSearchParams({
      'pageable.page': String(Math.floor(input.offset / input.limit)),
      'pageable.size': String(input.limit),
    });
    if (input.remoteId !== undefined) query.set('idAvisoNavplat', input.remoteId);
    const agency = encodeURIComponent(input.externalAccountId);
    const result = await this.deps.api.get(
      `/v1/inmobiliarias/${agency}/avisos/online/resumen?${query.toString()}`,
      SummaryPageSchema,
    );
    if (result.isErr()) return err(readError(result.error));
    // 204: no hay avisos online.
    const page = result.value ?? { total: 0, content: [] };
    return ok({ items: page.content.map(toRemote), total: page.total });
  }

  /**
   * El resumen de Zonaprop solo filtra por `idAvisoNavplat`: para buscar por clave interna se
   * recorren las páginas de a {@link REFERENCE_PAGE_SIZE}, hasta {@link REFERENCE_MAX_PAGES}.
   */
  async onlineByReference(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly reference: string;
  }): Promise<Result<readonly RemoteListing[], PortalNotConfiguredError | PortalUnavailableError>> {
    const wanted = input.reference.trim().toUpperCase();
    const found: RemoteListing[] = [];
    let total: number | undefined;
    for (let page = 0; page < REFERENCE_MAX_PAGES; page += 1) {
      const offset = page * REFERENCE_PAGE_SIZE;
      if (total !== undefined && offset >= total) break;
      const range = await this.#referenceRange(input, offset, wanted);
      if (range.isErr()) return err(range.error);
      total = range.value.total;
      found.push(...range.value.found);
    }
    return ok(found);
  }

  /**
   * Una página del recorrido por clave interna. Un aviso roto hace que Zonaprop responda 500 a toda
   * la página que lo trae (pasa en el sandbox): entonces se relee de a {@link REFERENCE_RETRY_SIZE}
   * y se saltean, con un aviso en el log, solo los tramos que siguen fallando.
   */
  async #referenceRange(
    input: { readonly portal: PortalId; readonly externalAccountId: string },
    offset: number,
    wanted: string,
  ): Promise<
    Result<
      { readonly found: readonly RemoteListing[]; readonly total: number },
      PortalNotConfiguredError | PortalUnavailableError
    >
  > {
    const matches = (items: readonly RemoteListing[]) =>
      items.filter((r) => [r.reference, r.code].some((c) => c?.toUpperCase() === wanted));
    const read = (from: number, limit: number) => this.online({ ...input, offset: from, limit });

    const page = await read(offset, REFERENCE_PAGE_SIZE);
    if (page.isOk()) return ok({ found: matches(page.value.items), total: page.value.total });
    if (page.error.type !== 'PortalUnavailable') return err(page.error);

    const found: RemoteListing[] = [];
    let total: number | undefined;
    let skipped = 0;
    for (let from = offset; from < offset + REFERENCE_PAGE_SIZE; from += REFERENCE_RETRY_SIZE) {
      if (total !== undefined && from >= total) break;
      const small = await read(from, REFERENCE_RETRY_SIZE);
      if (small.isErr()) {
        if (small.error.type !== 'PortalUnavailable') return err(small.error);
        skipped += REFERENCE_RETRY_SIZE;
        continue;
      }
      total = small.value.total;
      found.push(...matches(small.value.items));
    }
    // Nada se pudo leer: Zonaprop no está respondiendo.
    if (total === undefined) return err({ type: 'PortalUnavailable' });
    if (skipped > 0) {
      this.deps.logger.warn(
        { portal: input.portal, offset, skipped },
        'Zonaprop listings skipped while looking for an internal key',
      );
    }
    return ok({ found, total });
  }

  async link(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly remoteId: string;
    readonly listingId: string;
  }): Promise<
    Result<{ readonly externalId: string; readonly permalink: string | undefined }, PortalSyncError>
  > {
    if (input.portal !== 'zonaprop') return err({ type: 'PortalCredentialsMissing' });
    const code = listingCode(input.listingId);
    const linked = await this.#associate(input.externalAccountId, code, input.remoteId);
    if (linked.isErr()) return err(linked.error);
    this.deps.logger.info(
      { portal: 'zonaprop', remoteId: input.remoteId, listingCode: code },
      'Zonaprop listing linked',
    );
    return ok({ externalId: code, permalink: listingPermalink(input.remoteId) });
  }

  async onlineDevelopments(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly offset: number;
    readonly limit: number;
    readonly remoteId?: string;
  }): Promise<
    Result<PageSlice<RemoteDevelopment>, PortalNotConfiguredError | PortalUnavailableError>
  > {
    if (input.portal !== 'zonaprop') return err({ type: 'PortalNotConfigured' });
    const query = new URLSearchParams({
      'pageable.page': String(Math.floor(input.offset / input.limit)),
      'pageable.size': String(input.limit),
    });
    if (input.remoteId !== undefined) query.set('idAvisoNavplat', input.remoteId);
    const agency = encodeURIComponent(input.externalAccountId);
    const result = await this.deps.api.get(
      `/v1/inmobiliarias/${agency}/desarrollos/online/resumen?${query.toString()}`,
      DevelopmentPageSchema,
    );
    if (result.isErr()) return err(readError(result.error));
    // 204: no hay emprendimientos online.
    const page = result.value ?? { total: 0, content: [] };
    const items = page.content.flatMap((group) => group.desarrollos ?? []);
    return ok({ items: items.map(toRemoteDevelopment), total: page.total });
  }

  async linkDevelopment(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly remoteId: string;
    readonly listingId: string;
    readonly units: readonly { readonly remoteId: string; readonly propertyId: string }[];
  }): Promise<
    Result<
      {
        readonly externalId: string;
        readonly permalink: string | undefined;
        readonly linkedUnits: number;
      },
      PortalSyncError
    >
  > {
    if (input.portal !== 'zonaprop') return err({ type: 'PortalCredentialsMissing' });
    const code = listingCode(input.listingId);
    const linked = await this.#associate(input.externalAccountId, code, input.remoteId);
    if (linked.isErr()) return err(linked.error);

    // Una unidad que no se pudo tomar no frena el vínculo: el próximo envío manda las de Norde.
    let linkedUnits = 0;
    for (const unit of input.units) {
      const taken = await this.#associate(
        input.externalAccountId,
        unitCode(unit.propertyId),
        unit.remoteId,
      );
      if (taken.isOk()) linkedUnits += 1;
      else {
        this.deps.logger.warn(
          { portal: 'zonaprop', remoteId: unit.remoteId, error: taken.error.type },
          'Zonaprop development unit not linked',
        );
      }
    }
    this.deps.logger.info(
      { portal: 'zonaprop', remoteId: input.remoteId, listingCode: code, linkedUnits },
      'Zonaprop development linked',
    );
    return ok({ externalId: code, permalink: listingPermalink(input.remoteId), linkedUnits });
  }

  /** `asociar`: Zonaprop pasa a manejar el aviso `remoteId` con el código `code` de Norde. */
  async #associate(
    externalAccountId: string,
    code: string,
    remoteId: string,
  ): Promise<Result<void, PortalSyncError>> {
    const agency = encodeURIComponent(externalAccountId);
    const result = await this.deps.api.put(
      `/v1/inmobiliarias/${agency}/avisos/${encodeURIComponent(code)}/asociar/${encodeURIComponent(remoteId)}`,
      undefined,
      LinkResponseSchema,
    );
    if (result.isErr()) {
      // Vincular necesita un permiso aparte del integrador: Open Navent lo habilita a pedido.
      if (result.error.type === 'forbidden') return err(NO_LINK_PERMISSION);
      return err(syncError(result.error));
    }
    const answer = result.value;
    if (answer?.code !== undefined && answer.code !== null && answer.code !== 'ok') {
      return err({
        type: 'PortalRejected',
        reason: `Zonaprop no vinculó el aviso: ${answer.respuesta ?? answer.message ?? answer.code}`,
      });
    }
    return ok(undefined);
  }
}
