import 'server-only';

import type {
  PortalCreditView,
  PortalPackageView,
  PortalValue,
} from '@norde/core/portals/contracts';

import { getContainer } from '../../container';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';

import {
  CREDITS_ERROR_MESSAGES,
  PACKAGES_ERROR_MESSAGES,
  PORTAL_ACCOUNT_ERROR_MESSAGES,
  REMOTE_DEVELOPMENTS_ERROR_MESSAGES,
  REMOTE_LISTINGS_ERROR_MESSAGES,
} from './messages';

// Lecturas de portales para los Server Components. La autorización la decide el caso de uso.

/**
 * Las cuentas de portales para Mi empresa → Portales. `hidden` si la difusión está apagada, y el
 * mensaje si no se pueden ver.
 */
export async function loadPortalAccounts() {
  const portals = getContainer().portals;
  if (!portals) return { kind: 'hidden' as const };
  const { actor } = await requireSession();
  const result = await portals.listAccounts.execute({}, actor);
  return result.isOk()
    ? { kind: 'ok' as const, view: result.value }
    : {
        kind: 'error' as const,
        message: messageForError(result.error, PORTAL_ACCOUNT_ERROR_MESSAGES),
      };
}

/** Créditos de una cuenta conectada por código, leídos del portal en el momento. */
export type PortalCreditsResult =
  | { readonly ok: true; readonly credits: readonly PortalCreditView[] }
  | { readonly ok: false; readonly message: string };

/** Los créditos de cada cuenta conectada por código. Un portal caído no rompe la página. */
export async function loadPortalCredits(
  portals: readonly PortalValue[],
): Promise<Partial<Record<PortalValue, PortalCreditsResult>>> {
  const useCases = getContainer().portals;
  if (!useCases || portals.length === 0) return {};
  const { actor } = await requireSession();
  const entries = await Promise.all(
    portals.map(async (portal) => {
      const result = await useCases.getCredits.execute({ portal }, actor);
      const value: PortalCreditsResult = result.isOk()
        ? { ok: true, credits: result.value }
        : { ok: false, message: messageForError(result.error, CREDITS_ERROR_MESSAGES) };
      return [portal, value] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Paquetes de una cuenta conectada por OAuth (MercadoLibre), leídos del portal en el momento. */
export type PortalPackagesResult =
  | { readonly ok: true; readonly packages: readonly PortalPackageView[] }
  | { readonly ok: false; readonly message: string };

/** Los paquetes de cada cuenta de MercadoLibre conectada. Un portal caído no rompe la página. */
export async function loadPortalPackages(
  portals: readonly PortalValue[],
): Promise<Partial<Record<PortalValue, PortalPackagesResult>>> {
  const useCases = getContainer().portals;
  if (!useCases || portals.length === 0) return {};
  const { actor } = await requireSession();
  const entries = await Promise.all(
    portals.map(async (portal) => {
      const result = await useCases.getPackages.execute({ portal }, actor);
      const value: PortalPackagesResult = result.isOk()
        ? { ok: true, packages: result.value }
        : { ok: false, message: messageForError(result.error, PACKAGES_ERROR_MESSAGES) };
      return [portal, value] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Una página de los avisos online del portal, con su propiedad por código (Mi empresa). */
export async function loadRemoteListings(input: {
  readonly portal: PortalValue;
  readonly page: number;
  readonly pageSize: number;
}) {
  const portals = getContainer().portals;
  if (!portals) return { kind: 'hidden' as const };
  const { actor } = await requireSession();
  const result = await portals.listRemoteListings.execute(input, actor);
  return result.isOk()
    ? { kind: 'ok' as const, page: result.value }
    : {
        kind: 'error' as const,
        message: messageForError(result.error, REMOTE_LISTINGS_ERROR_MESSAGES),
      };
}

/** Una página de los emprendimientos online del portal, con el de Norde por código (Mi empresa). */
export async function loadRemoteDevelopments(input: {
  readonly portal: PortalValue;
  readonly page: number;
  readonly pageSize: number;
}) {
  const portals = getContainer().portals;
  if (!portals) return { kind: 'hidden' as const };
  const { actor } = await requireSession();
  const result = await portals.listRemoteDevelopments.execute(input, actor);
  return result.isOk()
    ? { kind: 'ok' as const, page: result.value }
    : {
        kind: 'error' as const,
        message: messageForError(result.error, REMOTE_DEVELOPMENTS_ERROR_MESSAGES),
      };
}
