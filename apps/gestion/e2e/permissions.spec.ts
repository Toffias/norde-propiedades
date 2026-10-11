import { expect, test } from '@playwright/test';

import { storageStateFor } from './support/users';

// La autorización la decide el caso de uso: sin el permiso, la pantalla lo dice en lugar de mostrar
// datos.

const FORBIDDEN = 'No podés ver esta sección';

test.describe('agente', () => {
  test.use({ storageState: storageStateFor('agent') });

  test('no ve los datos de la empresa', async ({ page }) => {
    await page.goto('/mi-empresa/general');

    await expect(page.getByText(FORBIDDEN)).toBeVisible();
  });

  test('ve las propiedades', async ({ page }) => {
    await page.goto('/propiedades');

    await expect(page.getByRole('heading', { level: 1, name: 'Propiedades' })).toBeVisible();
    await expect(page.getByText(FORBIDDEN)).toHaveCount(0);
  });
});

test.describe('gerente', () => {
  test.use({ storageState: storageStateFor('manager') });

  test('ve las oportunidades', async ({ page }) => {
    await page.goto('/oportunidades');

    await expect(page.getByRole('heading', { level: 1, name: 'Oportunidades' })).toBeVisible();
    await expect(page.getByText(FORBIDDEN)).toHaveCount(0);
  });
});

test.describe('administrativo de alquileres', () => {
  test.use({ storageState: storageStateFor('rentals-admin') });

  test('no ve las oportunidades', async ({ page }) => {
    await page.goto('/oportunidades');

    await expect(page.getByText(FORBIDDEN)).toBeVisible();
  });
});
