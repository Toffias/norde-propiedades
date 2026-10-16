import type {
  PortalAccountDirectory,
  PortalAccountLookupError,
  PortalAccountMatch,
  PortalCredit,
  PortalId,
  PortalNotConfiguredError,
  PortalUnavailableError,
} from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../../shared/logger';

import type { ZonapropApi, ZonapropApiError } from './zonaprop-api';

const AgencyPageSchema = z.object({
  total: z.number().int().nonnegative(),
  content: z.array(
    z.object({
      codigoInmobiliaria: z.string(),
      nombre: z.string().nullish(),
      bloqueada: z.boolean().nullish(),
    }),
  ),
});

const AvailabilitySchema = z.object({
  disponibles: z
    .array(
      z.object({
        planDePublicacion: z.string().min(1),
        cantidadDisponible: z.number().int(),
        cantidadContratado: z.number().int().nullish(),
      }),
    )
    .nullish(),
});

/** Las inmobiliarias de Norde en Zonaprop son pocas: alcanza con unas páginas. */
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

function portalError(error: ZonapropApiError): PortalNotConfiguredError | PortalUnavailableError {
  return error.type === 'not_configured'
    ? { type: 'PortalNotConfigured' }
    : { type: 'PortalUnavailable' };
}

/**
 * Las inmobiliarias (sucursales) que Zonaprop habilitó para Norde como integrador, y sus créditos.
 * La cuenta se busca por su código entre las habilitadas: si no está, la inmobiliaria todavía no
 * asoció a Norde en Zonaprop.
 */
export class ZonapropAccountDirectory implements PortalAccountDirectory {
  constructor(private readonly deps: { readonly api: ZonapropApi; readonly logger: InfraLogger }) {}

  async find(input: {
    readonly portal: PortalId;
    readonly accountCode: string;
  }): Promise<Result<PortalAccountMatch, PortalAccountLookupError>> {
    if (input.portal !== 'zonaprop') return err({ type: 'PortalNotConfigured' });

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        'pageable.page': String(page),
        'pageable.size': String(PAGE_SIZE),
      });
      const result = await this.deps.api.get(
        `/v1/inmobiliarias?${query.toString()}`,
        AgencyPageSchema,
      );
      if (result.isErr()) return err(portalError(result.error));
      // 204: Norde no tiene inmobiliarias habilitadas.
      const agencies = result.value?.content ?? [];
      const agency = agencies.find((a) => a.codigoInmobiliaria === input.accountCode);
      if (agency) {
        if (agency.bloqueada === true) return err({ type: 'PortalAccountBlocked' });
        this.deps.logger.info({ portal: input.portal }, 'Zonaprop agency found');
        const name = agency.nombre?.trim() ?? '';
        return ok({
          externalAccountId: agency.codigoInmobiliaria,
          accountName: name === '' ? agency.codigoInmobiliaria : name,
        });
      }
      const seen = page * PAGE_SIZE + agencies.length;
      if (agencies.length === 0 || seen >= (result.value?.total ?? 0)) break;
    }
    return err({ type: 'PortalAccountNotFound' });
  }

  async credits(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
  }): Promise<Result<readonly PortalCredit[], PortalNotConfiguredError | PortalUnavailableError>> {
    if (input.portal !== 'zonaprop') return err({ type: 'PortalNotConfigured' });
    const code = encodeURIComponent(input.externalAccountId);
    const result = await this.deps.api.get(
      `/v1/inmobiliarias/${code}/disponibilidad`,
      AvailabilitySchema,
    );
    if (result.isErr()) {
      // La cuenta dejó de estar asociada a Norde: se informa como que Zonaprop no la da.
      if (result.error.type === 'forbidden' || result.error.type === 'not_found') {
        this.deps.logger.warn(
          { portal: input.portal, reason: result.error.type },
          'Zonaprop refused the agency credits',
        );
      }
      return err(portalError(result.error));
    }
    return ok(
      (result.value?.disponibles ?? []).map((d) => ({
        plan: d.planDePublicacion,
        available: d.cantidadDisponible,
        contracted: d.cantidadContratado ?? undefined,
        // Los planes de emprendimientos de Zonaprop empiezan con `DESARROLLOS_`.
        publishes: d.planDePublicacion.startsWith('DESARROLLOS_') ? 'development' : 'property',
      })),
    );
  }
}
