import { err, ok, type Result } from '../../shared';
import { PORTAL_CATALOG, type PortalConnectionMethod, type PortalId } from '../domain/portal';

/** La cuenta se conecta de otra forma (por ejemplo, Zonaprop no usa OAuth). */
export interface WrongConnectionMethodError {
  readonly type: 'WrongConnectionMethod';
}

/** Que el portal se conecte con ese método. */
export function requireConnectionMethod(
  portal: PortalId,
  method: PortalConnectionMethod,
): Result<void, WrongConnectionMethodError> {
  return PORTAL_CATALOG[portal].connection === method
    ? ok(undefined)
    : err({ type: 'WrongConnectionMethod' });
}
