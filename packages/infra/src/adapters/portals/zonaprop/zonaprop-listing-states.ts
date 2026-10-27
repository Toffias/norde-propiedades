import type {
  PortalCredentialsMissingError,
  PortalId,
  PortalListingStateReader,
  PortalUnavailableError,
  RemoteListingState,
} from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

import type { ZonapropApi } from './zonaprop-api';
import { listingPermalink } from './zonaprop-listing';

const MessageSchema = z.object({ messageText: z.string().nullish() });

/** `/avisos/{codigoAviso}/status`: si está online y lo que Zonaprop observó del aviso. */
const StatusSchema = z.object({
  estado: z.string().nullish(),
  idAvisoNavplat: z.union([z.number(), z.string()]).nullish(),
  errores: z.array(MessageSchema).nullish(),
  errors: z.array(MessageSchema).nullish(),
});

const OFFLINE_REASON =
  'Zonaprop tiene el aviso offline (puede ser el plan vencido, la calidad o las fotos). Revisalo en Zonaprop y tocá "Sincronizar" para volver a mandarlo.';

/** Pedidos a la vez: uno por aviso, sin saturar la API. */
const CONCURRENCY = 5;

type ReadError = PortalUnavailableError | PortalCredentialsMissingError;

/**
 * Cómo están los avisos de Norde en Zonaprop (la conciliación diaria), uno por uno con su `status`.
 * `ONLINE` es activo; `OFFLINE` es pausado (Zonaprop no da de baja para siempre: el aviso vuelve
 * con otro envío), con el motivo que informe. Uno en espera (`EN_ESPERA`, un emprendimiento grande
 * que se procesa), con otro estado o que Zonaprop no encuentra queda como estaba. Trae también el
 * link del aviso, que la API no da al publicar.
 */
export class ZonapropListingStates implements PortalListingStateReader {
  constructor(
    private readonly options: {
      readonly api: ZonapropApi;
      /** El código de inmobiliaria de la cuenta conectada. */
      readonly agencyCode: () => Promise<string | undefined>;
      readonly logger: InfraLogger;
    },
  ) {}

  async states(
    portal: PortalId,
    externalIds: readonly string[],
  ): Promise<Result<ReadonlyMap<string, RemoteListingState>, ReadError>> {
    if (portal !== 'zonaprop') return err({ type: 'PortalCredentialsMissing' });
    const agencyCode = await this.options.agencyCode();
    if (agencyCode === undefined) return err({ type: 'PortalCredentialsMissing' });

    const states = new Map<string, RemoteListingState>();
    for (let i = 0; i < externalIds.length; i += CONCURRENCY) {
      const ids = externalIds.slice(i, i + CONCURRENCY);
      const read = await Promise.all(ids.map((id) => this.#state(agencyCode, id)));
      for (const [index, result] of read.entries()) {
        const id = ids[index];
        if (id === undefined) continue;
        if (result.isErr()) return err(result.error);
        if (result.value !== undefined) states.set(id, result.value);
      }
    }
    return ok(states);
  }

  async #state(
    agencyCode: string,
    externalId: string,
  ): Promise<Result<RemoteListingState | undefined, ReadError>> {
    const path = `/v1/inmobiliarias/${encodeURIComponent(agencyCode)}/avisos/${encodeURIComponent(externalId)}/status`;
    const result = await this.options.api.get(path, StatusSchema);
    if (result.isErr()) {
      switch (result.error.type) {
        case 'not_found':
        case 'rejected':
          // No es un aviso (un emprendimiento) o Zonaprop no lo tiene: queda como estaba.
          return ok(undefined);
        case 'not_configured':
        case 'forbidden':
          return err({ type: 'PortalCredentialsMissing' });
        case 'unavailable':
          return err({ type: 'PortalUnavailable' });
      }
    }
    const status = result.value;
    const remoteId = status?.idAvisoNavplat;
    const permalink =
      remoteId === undefined || remoteId === null ? undefined : listingPermalink(remoteId);
    const estado = status?.estado?.trim().toUpperCase();
    if (estado === 'ONLINE') return ok({ state: 'active', reason: undefined, permalink });
    if (estado === 'OFFLINE') {
      const detail = [...(status?.errores ?? []), ...(status?.errors ?? [])]
        .map((m) => m.messageText?.trim())
        .find((text) => text !== undefined && text !== '');
      return ok({
        state: 'paused',
        reason:
          detail === undefined ? OFFLINE_REASON : `${OFFLINE_REASON} Zonaprop dice: ${detail}`,
        permalink,
      });
    }
    // `EN_ESPERA` u otro: se mira en la próxima conciliación. El estado no es un dato personal.
    this.options.logger.info(
      { portal: 'zonaprop', externalId, estado: estado ?? null },
      'Zonaprop listing in a transitional state',
    );
    return ok(undefined);
  }
}
