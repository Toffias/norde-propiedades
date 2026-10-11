import { expect, test } from '@playwright/test';

import { storageStateFor } from './support/users';

test.use({ storageState: storageStateFor('admin') });

test('en el celular el buscador se abre desde la barra y lleva a la ficha', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Buscar' });
  await sheet
    .getByRole('combobox', { name: 'Buscar contactos, propiedades, emprendimientos o agentes' })
    .fill('P-013');
  await sheet.getByRole('option', { name: /P-013/ }).click();

  await expect(page).toHaveURL(/\/propiedades\/[0-9a-f-]{36}/);
});
