import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * Los inputs de texto valen `''` cuando están vacíos, pero los contracts del core modelan un dato
 * ausente como `undefined` (y `''` no pasa `min(1)`). Convierte los textos en blanco en `undefined`,
 * en objetos y arrays anidados.
 */
export function blankToUndefined<T>(value: T): T {
  if (typeof value === 'string') {
    // `undefined` reemplaza a un string vacío: es el "valor ausente" del mismo campo.
    return (value.trim() === '' ? undefined : value) as T;
  }
  if (Array.isArray(value)) {
    // Mismo array, elemento por elemento.
    return value.map((item: unknown) => blankToUndefined(item)) as T;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    // Mismo objeto plano, campo por campo.
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, blankToUndefined(item)]),
    ) as T;
  }
  return value;
}

/** Resolver de react-hook-form sobre un contract Zod del core (el mismo que valida el servidor). */
export function contractResolver<Input extends FieldValues, Output>(
  schema: z.ZodType<Output, Input>,
): Resolver<Input, unknown, Output> {
  const resolver = zodResolver<Input, unknown, Output>(schema);
  return (values, context, options) => resolver(blankToUndefined(values), context, options);
}
