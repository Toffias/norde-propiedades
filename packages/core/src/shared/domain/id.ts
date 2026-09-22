import { err, ok, type Result } from './result';

declare const brand: unique symbol;

/**
 * Identificador tipado por aggregate (`Id<'Property'>` no es asignable a `Id<'Client'>`).
 * Los aggregates de otros módulos se referencian solo por su Id.
 */
export type Id<TBrand extends string> = string & { readonly [brand]: TBrand };

export interface InvalidIdError {
  readonly type: 'InvalidId';
  readonly value: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseId<TBrand extends string>(value: string): Result<Id<TBrand>, InvalidIdError> {
  if (!UUID.test(value)) return err({ type: 'InvalidId', value });
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- único punto donde se construye un Id "branded", después de validar el formato.
  return ok(value.toLowerCase() as Id<TBrand>);
}
