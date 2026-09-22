import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { err, ok, type Result } from '../result';

export interface InvalidPhoneError {
  readonly type: 'InvalidPhone';
}

/** Teléfono normalizado a E.164. Si existe, es válido. */
export class Phone {
  private constructor(
    /** Formato E.164, ej. `+5491166899124`. */
    readonly e164: string,
    /**
     * Clave para deduplicar clientes. En Argentina el mismo celular se escribe con o sin
     * el 9 de móvil ("+54 9 11 …" en WhatsApp, "11 …" en un formulario): la clave lo ignora.
     */
    readonly matchKey: string,
  ) {}

  /** Acepta formato internacional o nacional argentino ("011 15 …", "11 …"). */
  static create(raw: string): Result<Phone, InvalidPhoneError> {
    const parsed = parsePhoneNumberFromString(raw.trim(), 'AR');
    if (!parsed?.isValid()) return err({ type: 'InvalidPhone' });

    const national = parsed.nationalNumber;
    const isArgentineMobile =
      parsed.countryCallingCode === '54' && national.length === 11 && national.startsWith('9');
    const matchKey = isArgentineMobile ? `+54${national.slice(1)}` : parsed.number;

    return ok(new Phone(parsed.number, matchKey));
  }

  /** Mismo número de contacto, aunque esté escrito con o sin el 9 de móvil. */
  sameContactAs(other: Phone): boolean {
    return this.matchKey === other.matchKey;
  }
}
