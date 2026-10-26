// Los datos de contacto de un propietario son sensibles: sin "Ver datos de propietarios" se
// muestran enmascarados, con lo justo para reconocerlos (los últimos dígitos, la inicial).

/** `+5491166899124` → `+54 •••• 9124`. */
export function maskPhone(e164: string): string {
  const country = e164.startsWith('+54') ? '+54' : e164.slice(0, 3);
  return `${country} •••• ${e164.slice(-4)}`;
}

/** `ana.perez@mail.com` → `a•••@mail.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

const DNI =
  /\b(d\.?n\.?i\.?|documento)([\s:]*(?:(?:n[°º.]?|nro\.?|número|es)[\s:]*)?)\d{1,2}\.?\d{3}\.?\d{3}\b/giu;
// Con guiones (20-12345678-3) o después de "CUIT"/"CUIL": sin eso se confunde con un teléfono.
const CUIT = /\b(?:(?:cuit|cuil)\s*:?\s*\d{2}-?\d{8}-?\d|(?:20|23|24|27|30|33|34)-\d{8}-\d)\b/giu;
// 15 a 19 dígitos: un teléfono argentino en formato internacional tiene 13 como máximo.
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){14,18}\b/gu;

/**
 * Oculta en un texto libre (la nota de una consulta) los números que no deberían guardarse:
 * documento, CUIT/CUIL y tarjetas. Los teléfonos quedan: son el dato de contacto. Una tarjeta se
 * distingue por el largo y el dígito verificador (Luhn).
 */
export function maskSensitiveNumbers(text: string): string {
  return text
    .replace(DNI, (_match, label: string, separator: string) => `${label}${separator}[oculto]`)
    .replace(CUIT, '[CUIT oculto]')
    .replace(CARD_CANDIDATE, (match) =>
      passesLuhn(match.replace(/\D/g, '')) ? '[tarjeta oculta]' : match,
    );
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
