import { err, ok, type Result } from '../../shared/domain/result';

export interface InvalidExchangeRateError {
  readonly type: 'InvalidExchangeRate';
}

/** Tope razonable: un millón de pesos por dólar. */
const MAX_ARS_CENTS_PER_USD = 100_000_000n;

/** "1.450", "1450", "1.450,50": puntos de miles opcionales y hasta dos decimales con coma. */
const PESOS_TEXT = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;

/**
 * Cotización del dólar que carga Norde a mano en Mi empresa: cuántos pesos vale un dólar. La usa
 * el buscador de la web para comparar precios en pesos y en dólares. Se guarda en centavos.
 */
export class UsdExchangeRate {
  private constructor(readonly arsCentsPerUsd: bigint) {}

  static fromCents(cents: bigint): Result<UsdExchangeRate, InvalidExchangeRateError> {
    if (cents <= 0n || cents > MAX_ARS_CENTS_PER_USD) return err({ type: 'InvalidExchangeRate' });
    return ok(new UsdExchangeRate(cents));
  }

  /** Lo que se escribe en el formulario, en pesos con formato argentino. */
  static fromText(text: string): Result<UsdExchangeRate, InvalidExchangeRateError> {
    const trimmed = text.trim();
    if (!PESOS_TEXT.test(trimmed)) return err({ type: 'InvalidExchangeRate' });
    const [whole = '', decimals = ''] = trimmed.replace(/\./g, '').split(',');
    return UsdExchangeRate.fromCents(BigInt(whole) * 100n + BigInt(decimals.padEnd(2, '0')));
  }

  /** "1.450,5" → "1.450,50"; sin decimales, "1.450". */
  toText(): string {
    const whole = (this.arsCentsPerUsd / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const cents = this.arsCentsPerUsd % 100n;
    return cents === 0n ? whole : `${whole},${cents.toString().padStart(2, '0')}`;
  }

  equals(other: UsdExchangeRate | undefined): boolean {
    return other?.arsCentsPerUsd === this.arsCentsPerUsd;
  }
}
