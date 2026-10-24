import { describe, expect, it } from 'vitest';

import { SITE_NAV } from './site-nav';

describe('SITE_NAV', () => {
  it('lists the operations, the appraisals, the developments and the contact page, without the blog', () => {
    expect(SITE_NAV).toEqual([
      { label: 'Comprar', href: '/propiedades?operacion=venta' },
      { label: 'Alquilar', href: '/propiedades?operacion=alquiler' },
      { label: 'Tasaciones', href: '/tasar-mi-propiedad' },
      { label: 'Emprendimientos', href: '/emprendimientos' },
      { label: 'Contacto', href: '/contacto' },
    ]);
  });
});
