import type {
  PortalId,
  PortalListingCatalog,
  PortalNotConfiguredError,
  PortalSyncError,
  PortalUnavailableError,
  RemoteListing,
} from '@norde/core/portals';
import { err, ok, type PageSlice, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

import type { ZonapropApi, ZonapropApiError } from './zonaprop-api';
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

function readError(error: ZonapropApiError): PortalNotConfiguredError | PortalUnavailableError {
  return error.type === 'not_configured' || error.type === 'forbidden'
    ? { type: 'PortalNotConfigured' }
    : { type: 'PortalUnavailable' };
}

/**
 * Los avisos online de la inmobiliaria en Zonaprop (`/avisos/online/resumen`, paginado por
 * Zonaprop), y `asociar` para que Norde maneje uno que publicó otro sistema, con su propio código.
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
    const agency = encodeURIComponent(input.externalAccountId);
    const result = await this.deps.api.put(
      `/v1/inmobiliarias/${agency}/avisos/${encodeURIComponent(code)}/asociar/${encodeURIComponent(input.remoteId)}`,
      undefined,
      LinkResponseSchema,
    );
    if (result.isErr()) {
      // Vincular necesita un permiso aparte del integrador: Open Navent lo habilita a pedido.
      if (result.error.type === 'forbidden') {
        return err({
          type: 'PortalRejected',
          reason:
            'Zonaprop no le da permiso a Norde para vincular avisos. Hay que pedirle a Zonaprop (integracion@ar.quintoandar.com) que habilite "asociar avisos" para el integrador.',
        });
      }
      return err(syncError(result.error));
    }
    const answer = result.value;
    if (answer?.code !== undefined && answer.code !== null && answer.code !== 'ok') {
      return err({
        type: 'PortalRejected',
        reason: `Zonaprop no vinculó el aviso: ${answer.respuesta ?? answer.message ?? answer.code}`,
      });
    }
    this.deps.logger.info(
      { portal: 'zonaprop', remoteId: input.remoteId, listingCode: code },
      'Zonaprop listing linked',
    );
    return ok({ externalId: code, permalink: listingPermalink(input.remoteId) });
  }
}
