import { parseId, type Id } from '../domain/id';

import type { IdGenerator } from './ports';

/** Pide un ID al generador y lo tipa con la marca del aggregate. Un ID inválido es un bug. */
export function nextId<TBrand extends string>(ids: IdGenerator): Id<TBrand> {
  const id = parseId<TBrand>(ids.next());
  if (id.isErr()) throw new Error(`IdGenerator produced an invalid id: ${id.error.value}`);
  return id.value;
}
