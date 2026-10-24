import type { MoneyDto } from '@norde/core/properties/contracts';

const units = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** "USD 98.000" o "$ 420.000". Los centavos no se muestran: los precios son redondos. */
export function formatMoney(money: MoneyDto): string {
  const amount = units.format(money.amountCents / 100n);
  return money.currency === 'USD' ? `USD ${amount}` : `$ ${amount}`;
}

/** El precio de una tarjeta o de la ficha: sin precio publicado, "Consultar precio". */
export function formatPrice(money: MoneyDto | null): string {
  return money === null ? 'Consultar precio' : formatMoney(money);
}

const oneDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/**
 * El precio corto del pin del mapa: "USD 150 mil", "$ 1,2 M"; sin precio, "Consultar". Armado a
 * mano: la notación compacta de `Intl` cambia según la versión de ICU ("150 k" o "150 mil").
 */
export function formatShortPrice(money: MoneyDto | null): string {
  if (money === null) return 'Consultar';
  const value = Number(money.amountCents / 100n);
  const amount =
    value >= 1_000_000
      ? `${oneDecimal.format(value / 1_000_000)} M`
      : value >= 1_000
        ? `${units.format(value / 1_000)} mil`
        : units.format(value);
  return money.currency === 'USD' ? `USD ${amount}` : `$ ${amount}`;
}

/** "72 m²", con hasta un decimal ("48,5 m²"). */
export function formatSurface(m2: number): string {
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(m2)} m²`;
}

/** "1 dormitorio", "3 dormitorios". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
