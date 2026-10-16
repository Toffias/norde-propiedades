import type {
  PortalConnector,
  PortalId,
  PortalListingContent,
  PortalListingUpdate,
  PortalSyncError,
} from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';

import type { InfraLogger } from '../../../shared/logger';

import type { ZonapropApi, ZonapropApiError } from './zonaprop-api';
import {
  ProcessedResponseSchema,
  listingBody,
  listingCode,
  listingPermalink,
  listingProblems,
  processedOf,
  rejectionReason,
} from './zonaprop-listing';
import type { ZonapropLocationNotFound, ZonapropLocations } from './zonaprop-locations';

/** El código de inmobiliaria de la cuenta conectada (Mi empresa → Portales), o `undefined`. */
export type ZonapropAgencyCode = () => Promise<string | undefined>;

export interface ZonapropPortalConnectorOptions {
  readonly api: ZonapropApi;
  readonly locations: ZonapropLocations;
  readonly agencyCode: ZonapropAgencyCode;
  readonly logger: InfraLogger;
}

const NOT_CONNECTED: PortalSyncError = { type: 'PortalCredentialsMissing' };

export function syncError(error: ZonapropApiError | ZonapropLocationNotFound): PortalSyncError {
  switch (error.type) {
    case 'not_configured':
    case 'forbidden':
      return { type: 'PortalCredentialsMissing' };
    case 'location_not_found':
      return {
        type: 'PortalRejected',
        reason: 'Zonaprop no encontró la ubicación de la propiedad: revisá la latitud y longitud.',
      };
    case 'rejected':
      return {
        type: 'PortalRejected',
        reason:
          rejectionReason(error.body) ??
          `Zonaprop rechazó el aviso (HTTP ${String(error.status)}).`,
      };
    case 'not_found':
    case 'unavailable':
      return { type: 'PortalUnavailable' };
  }
}

/**
 * Conector de Zonaprop (API de Open Navent). Un aviso por propiedad con todas sus operaciones, y
 * el código del aviso lo elige Norde (el ID de la publicación). La API es "crear o modificar" con
 * `PUT`, y `DELETE` lo pone offline: Zonaprop no pausa, así que pausar es sacarlo y reactivar es
 * volver a mandarlo completo.
 */
export class ZonapropPortalConnector implements PortalConnector {
  constructor(private readonly options: ZonapropPortalConnectorOptions) {}

  problems(_portal: PortalId, content: PortalListingContent): readonly string[] {
    return listingProblems(content);
  }

  async create(
    _portal: PortalId,
    content: PortalListingContent,
  ): Promise<
    Result<{ readonly externalId: string; readonly permalink: string | undefined }, PortalSyncError>
  > {
    const sent = await this.#put(content);
    if (sent.isErr()) return err(sent.error);
    return ok({ externalId: sent.value.code, permalink: sent.value.permalink });
  }

  async update(
    _portal: PortalId,
    externalId: string,
    change: {
      readonly content: PortalListingContent;
      readonly contentChanged: boolean;
      readonly state: 'active' | 'paused';
    },
  ): Promise<Result<PortalListingUpdate, PortalSyncError>> {
    if (change.state === 'paused') {
      const removed = await this.#delete(externalId);
      return removed.isErr() ? err(removed.error) : ok({ state: 'paused', permalink: undefined });
    }
    // Online: con contenido nuevo o para volver a mostrarlo, se manda el aviso completo.
    const sent = await this.#put(change.content);
    return sent.isErr()
      ? err(sent.error)
      : ok({ state: 'active', permalink: sent.value.permalink });
  }

  async close(_portal: PortalId, externalId: string): Promise<Result<void, PortalSyncError>> {
    return this.#delete(externalId);
  }

  /** Manda el aviso completo. Devuelve el código del aviso y su link, si Zonaprop dio su ID. */
  async #put(
    content: PortalListingContent,
  ): Promise<
    Result<{ readonly code: string; readonly permalink: string | undefined }, PortalSyncError>
  > {
    const agencyCode = await this.options.agencyCode();
    if (agencyCode === undefined) return err(NOT_CONNECTED);
    if (content.source.coordinates === undefined) {
      return err({ type: 'PortalRejected', reason: listingProblems(content).join(' ') });
    }
    const location = await this.options.locations.resolve(content.source.coordinates);
    if (location.isErr()) return err(syncError(location.error));

    const code = listingCode(content.listingId);
    const result = await this.options.api.put(
      `/v1/inmobiliarias/${encodeURIComponent(agencyCode)}/avisos/${encodeURIComponent(code)}`,
      listingBody(content, { agencyCode, locationId: location.value }),
      ProcessedResponseSchema,
    );
    if (result.isErr()) return err(syncError(result.error));
    const processed = processedOf(result.value);
    if (processed?.error === true || (processed?.errors?.length ?? 0) > 0) {
      return err({
        type: 'PortalRejected',
        reason: rejectionReason(result.value) ?? 'Zonaprop rechazó el aviso.',
      });
    }
    this.options.logger.info(
      { portal: 'zonaprop', listingCode: code, state: processed?.estado ?? null },
      'Zonaprop listing sent',
    );
    const remoteId = processed?.idAviso;
    return ok({
      code,
      permalink:
        remoteId === undefined || remoteId === null ? undefined : listingPermalink(remoteId),
    });
  }

  /** Pone el aviso offline. Uno que Zonaprop no tiene ya está fuera del portal. */
  async #delete(externalId: string): Promise<Result<void, PortalSyncError>> {
    const agencyCode = await this.options.agencyCode();
    if (agencyCode === undefined) return err(NOT_CONNECTED);
    const result = await this.options.api.delete(
      `/v1/inmobiliarias/${encodeURIComponent(agencyCode)}/avisos/${encodeURIComponent(externalId)}`,
      ProcessedResponseSchema,
    );
    if (result.isErr()) {
      return result.error.type === 'not_found' ? ok(undefined) : err(syncError(result.error));
    }
    const processed = processedOf(result.value);
    if ((processed?.errors?.length ?? 0) > 0) {
      return err({
        type: 'PortalRejected',
        reason: rejectionReason(result.value) ?? 'Zonaprop no pudo poner offline el aviso.',
      });
    }
    return ok(undefined);
  }
}
