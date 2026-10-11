import { expect, test } from '@playwright/test';

import { firstName, storageStateFor } from './support/users';

// Humo de cada módulo: con la sesión del administrador (que ve todo), cada pantalla carga con los
// datos del seed y sin el error genérico.

test.use({ storageState: storageStateFor('admin') });

const MODULES = [
  { path: '/', heading: `Hola, ${firstName('admin')}` },
  { path: '/noticias', heading: 'Noticias' },
  { path: '/oportunidades', heading: 'Oportunidades' },
  { path: '/contactos', heading: 'Contactos' },
  { path: '/consultas', heading: 'Consultas' },
  { path: '/propiedades', heading: 'Propiedades' },
  { path: '/emprendimientos', heading: 'Emprendimientos' },
  { path: '/tasaciones', heading: 'Tasaciones' },
  { path: '/reservas', heading: 'Reservas' },
] as const;

/** Las secciones de "Mi empresa" que no dependen de una función apagada (#50). */
const COMPANY_SECTIONS = [
  '/mi-empresa/general',
  '/mi-empresa/email',
  '/mi-empresa/portales',
  '/mi-empresa/ficha-pdf',
  '/mi-empresa/propiedades',
  '/mi-empresa/ubicaciones',
  '/mi-empresa/caracteristicas',
  '/mi-empresa/etiquetas',
  '/mi-empresa/oportunidades',
  '/mi-empresa/usuarios',
  '/mi-empresa/roles',
  '/mi-empresa/sucursales',
  '/mi-empresa/archivos',
] as const;

const GENERIC_ERROR = 'No pudimos cargar esta pantalla';
const FORBIDDEN = 'No podés ver esta sección';

for (const { path, heading } of MODULES) {
  test(`${path} carga`, async ({ page }) => {
    const response = await page.goto(path);

    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);
    await expect(page.getByText(FORBIDDEN)).toHaveCount(0);
  });
}

for (const path of COMPANY_SECTIONS) {
  test(`${path} carga`, async ({ page }) => {
    const response = await page.goto(path);

    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);
    await expect(page.getByText(FORBIDDEN)).toHaveCount(0);
  });
}

test('el listado de propiedades muestra el seed y abre la ficha', async ({ page }) => {
  await page.goto('/propiedades');
  const firstRow = page.getByRole('row').nth(1);

  await firstRow.getByRole('link').first().click();

  await expect(page).toHaveURL(/\/propiedades\/[0-9a-f-]{36}/);
  await expect(page.getByText(GENERIC_ERROR)).toHaveCount(0);
});

test('el menú lateral lleva a cada módulo', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Contactos', exact: true }).first().click();

  await expect(page).toHaveURL(/\/contactos/);
  await expect(page.getByRole('heading', { level: 1, name: 'Contactos' })).toBeVisible();
});
