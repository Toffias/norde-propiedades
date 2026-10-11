import { expect, test } from '@playwright/test';

import { createContact } from './support/clients';
import { storageStateFor } from './support/users';

// Lo que el agente puede hacer con los contactos: ve y edita solo los suyos, y no borra, unifica
// ni suprime.

test.use({ storageState: storageStateFor('agent') });

test('el contacto que crea queda a su cargo y sin acciones de administración', async ({ page }) => {
  const contact = await createContact(page);

  await expect(page.getByRole('heading', { level: 1, name: contact.name })).toBeVisible();
  await expect(page.getByText('Camila Agente').first()).toBeVisible();
  for (const action of ['Borrar', 'Unificar', 'Suprimir datos', 'Cambiar agente']) {
    await expect(page.getByRole('button', { name: action })).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: 'Exportar a Excel' })).toHaveCount(0);
});

test('no ve los contactos de otros', async ({ page, browser }) => {
  const admin = await browser.newContext({ storageState: storageStateFor('admin') });
  const adminPage = await admin.newPage();
  const othersContact = await createContact(adminPage);
  await admin.close();

  await page.goto(`/contactos?q=${encodeURIComponent(othersContact.name)}`);
  await expect(page.getByText('No hay contactos que coincidan con los filtros.')).toBeVisible();

  await page.goto(`/contactos/${othersContact.id}`);
  await expect(page.getByText('No tenés permiso para ver este contacto.')).toBeVisible();
});

test('no ve la papelera ni puede exportar', async ({ page }) => {
  await page.goto('/contactos');

  await expect(page.getByRole('button', { name: 'Nuevo contacto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar a Excel' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Más filtros/ }).click();
  await expect(page.getByText('Mostrar', { exact: true })).toHaveCount(0);
});
