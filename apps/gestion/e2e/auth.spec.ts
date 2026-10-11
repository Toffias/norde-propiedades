import { expect, test } from '@playwright/test';

import { seedUser } from './support/users';

// Sin sesión. Ingresar bien ya lo prueba `auth.setup.ts`; acá va un solo intento más, para no
// pasarse del límite de 5 ingresos por minuto de producción.

test('una ruta del panel lleva al ingreso y recuerda a dónde volver', async ({ page }) => {
  await page.goto('/propiedades?page=2');

  await expect(page).toHaveURL(/\/ingresar\?volver=/);
  expect(new URL(page.url()).searchParams.get('volver')).toBe('/propiedades?page=2');
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
});

test('una contraseña incorrecta no ingresa y lo avisa', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByLabel('Email', { exact: true }).fill(seedUser('agent').email);
  await page.getByLabel('Contraseña', { exact: true }).fill('no-es-la-contrasena');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/ingresar/);
});
