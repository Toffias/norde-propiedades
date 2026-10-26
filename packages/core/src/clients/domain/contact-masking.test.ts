import { describe, expect, it } from 'vitest';

import { maskSensitiveNumbers } from './contact-masking';

describe('maskSensitiveNumbers', () => {
  it('hides document numbers after the label', () => {
    expect(maskSensitiveNumbers('Mi DNI es 30.123.456 y quiero visitar')).toBe(
      'Mi DNI es [oculto] y quiero visitar',
    );
    expect(maskSensitiveNumbers('documento nro: 30123456')).toBe('documento nro: [oculto]');
  });

  it('hides CUIT/CUIL with dashes or label', () => {
    expect(maskSensitiveNumbers('CUIT 20-30123456-7')).toBe('[CUIT oculto]');
    expect(maskSensitiveNumbers('cuil: 27301234564')).toBe('[CUIT oculto]');
  });

  it('hides card numbers that pass the Luhn check', () => {
    expect(maskSensitiveNumbers('pago con 4111 1111 1111 1111')).toBe('pago con [tarjeta oculta]');
  });

  it('keeps phones, prices and other numbers', () => {
    const text = 'Llamame al +54 9 11 6689 9124, presupuesto USD 120.000, 2 ambientes, 30123456';

    expect(maskSensitiveNumbers(text)).toBe(text);
  });
});
