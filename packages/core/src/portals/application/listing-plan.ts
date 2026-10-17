import { err, ok, type Result } from '../../shared';
import type { ListingOperation } from '../domain/listing';
import { PORTAL_CATALOG, type ListingOwnerKind, type PortalId } from '../domain/portal';
import type { PortalAccountDirectory } from './ports/portal-account-directory';
import type { ListingSource } from './ports/listing-source';
import type { PortalNotConfiguredError, PortalUnavailableError } from './ports/portal-authorizer';
import type { ValidationFailedError } from './portals-input';

/** El portal pide elegir un plan entre los contratados (Zonaprop). */
export interface PlanRequiredError {
  readonly type: 'PlanRequired';
}

/** La cuenta no tiene ese plan para ese tipo de aviso (propiedades o emprendimientos). */
export interface PlanNotOfferedError {
  readonly type: 'PlanNotOffered';
  readonly plan: string;
}

/** A la cuenta no le quedan créditos de ese plan. */
export interface NoCreditsLeftError {
  readonly type: 'NoCreditsLeft';
  readonly plan: string;
}

export type ListingPlanError =
  PlanNotOfferedError | NoCreditsLeftError | PortalNotConfiguredError | PortalUnavailableError;

function invalid(issue: string): ValidationFailedError {
  return { type: 'ValidationFailed', issues: [issue] };
}

/**
 * Que el pedido tenga la forma del aviso del portal: con operación si el portal publica un aviso por
 * operación y sin ella si publica uno por propiedad; con plan solo si el portal lo pide.
 */
export function checkListingShape(
  portal: PortalId,
  request: { readonly operation: ListingOperation | undefined; readonly plan: string | undefined },
): Result<void, ValidationFailedError | PlanRequiredError> {
  const { listingScope, choosesPlan } = PORTAL_CATALOG[portal];
  if (listingScope === 'operation' && request.operation === undefined) {
    return err(invalid('Elegí la operación que se publica.'));
  }
  if (listingScope === 'property' && request.operation !== undefined) {
    return err(invalid('En este portal el aviso lleva todas las operaciones de la propiedad.'));
  }
  if (choosesPlan && request.plan === undefined) return err({ type: 'PlanRequired' });
  if (!choosesPlan && request.plan !== undefined) {
    return err(invalid('Este portal no usa planes: elegí simple o destacado.'));
  }
  return ok(undefined);
}

/** Las operaciones que se publican: la pedida, o todas las que tienen precio. */
export function pricedOperations(source: ListingSource, operation: ListingOperation | undefined) {
  return source.operations.filter(
    (o) =>
      (operation === undefined || o.operation === operation) &&
      !o.priceOnRequest &&
      o.priceCents !== undefined,
  );
}

/**
 * Las unidades de un emprendimiento que van en su aviso: las disponibles con alguna operación con
 * precio (los portales exigen precio; una unidad "a consultar" no se publica).
 */
export function publishableUnits(units: readonly ListingSource[]): readonly ListingSource[] {
  return units.filter(
    (unit) => unit.availability === 'active' && pricedOperations(unit, undefined).length > 0,
  );
}

/**
 * Que la cuenta tenga ese plan para ese tipo de aviso y le queden créditos. Los lee del portal: es una
 * llamada externa, va fuera de la transacción.
 */
export async function checkPlanCredits(
  directory: PortalAccountDirectory,
  input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly plan: string;
    readonly publishes: ListingOwnerKind;
  },
): Promise<Result<void, ListingPlanError>> {
  const credits = await directory.credits({
    portal: input.portal,
    externalAccountId: input.externalAccountId,
  });
  if (credits.isErr()) return err(credits.error);
  const credit = credits.value.find(
    (c) => c.plan === input.plan && c.publishes === input.publishes,
  );
  if (!credit) return err({ type: 'PlanNotOffered', plan: input.plan });
  if (credit.available <= 0) return err({ type: 'NoCreditsLeft', plan: input.plan });
  return ok(undefined);
}
