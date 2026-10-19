import { describe, expect, it } from 'vitest';

import { isNavGroup, SITE_NAV } from './site-nav';

const group = (label: string) => {
  const entry = SITE_NAV.find((e) => e.label === label);
  if (!entry || !isNavGroup(entry)) throw new Error(`Missing nav group ${label}`);
  return entry;
};

describe('SITE_NAV', () => {
  it('lists every property type under Propiedades, after the full listing', () => {
    const items = group('Propiedades').items;
    expect(items[0]).toEqual({ label: 'Todas las propiedades', href: '/propiedades' });
    expect(items).toContainEqual({
      label: 'Departamentos',
      href: '/propiedades?tipo=departamento',
    });
    expect(items).toContainEqual({ label: 'Casas', href: '/propiedades?tipo=casa' });
    expect(items).toHaveLength(10);
  });

  it('links the operations to the filtered listing and to the appraisals page', () => {
    expect(group('Operación').items).toEqual([
      { label: 'Comprar', href: '/propiedades?operacion=venta' },
      { label: 'Alquilar', href: '/propiedades?operacion=alquiler' },
      { label: 'Tasaciones', href: '/tasar-mi-propiedad' },
    ]);
  });

  it('ends with the blog and the contact page as plain links', () => {
    expect(SITE_NAV.slice(2)).toEqual([
      { label: 'Blog', href: '/blog' },
      { label: 'Contacto', href: '/contacto' },
    ]);
  });
});
