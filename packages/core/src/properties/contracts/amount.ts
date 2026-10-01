import { z } from 'zod';

/** Monto en unidades con hasta dos decimales ("150000", "1500,50"): así lo escribe el usuario. */
const AMOUNT = /^\d{1,12}(?:[.,]\d{1,2})?$/;

/** "1500,5" → 150050n. Exacto: no pasa por `number`. */
function amountToCents(amount: string): bigint {
  const [units = '0', fraction = ''] = amount.replace(',', '.').split('.');
  return BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/**
 * Monto escrito por el usuario → centavos. También acepta los centavos ya parseados: la página
 * parsea los query params con el contract y el caso de uso vuelve a validar lo que recibe.
 */
export const AmountSchema = z.union([
  z
    .string()
    .trim()
    .regex(AMOUNT, 'Ingresá un monto sin puntos de miles, con hasta dos decimales.')
    .transform(amountToCents),
  z.bigint().nonnegative(),
]);
