import { expect, test, type Page } from '@playwright/test';

import { createContact, openContactTab } from './support/clients';
import { uniqueTag } from './support/properties';
import { storageStateFor } from './support/users';

// Suscripción a búsquedas desde la web (#208): lo que se ve en el panel. El pedido y la
// confirmación desde el sitio los cubren los tests del core y de integración.

test.use({ storageState: storageStateFor('admin') });

/** Da de alta un usuario agente desde Mi empresa y devuelve su email. */
async function createUser(page: Page, name: string): Promise<string> {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@norde.test`;
  await page.goto('/mi-empresa/usuarios?panel=new');
  const sheet = page.getByRole('dialog', { name: 'Nuevo usuario' });
  await sheet.getByLabel('Nombre y apellido').fill(name);
  await sheet.getByLabel('Email').fill(email);
  await sheet.getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
  await sheet.getByRole('checkbox').first().check();
  await sheet.getByRole('button', { name: 'Generar' }).click();
  await sheet.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByText('Usuario creado')).toBeVisible();
  return email;
}

/** Abre la edición de un usuario buscándolo en la grilla. */
async function editUser(page: Page, email: string) {
  await page.goto(`/mi-empresa/usuarios?q=${encodeURIComponent(email)}`);
  await page.getByRole('cell', { name: email }).first().click();
  return page.getByRole('dialog', { name: 'Editar usuario' });
}

test('only one user is the default advisor for assignments', async ({ page }) => {
  const tag = uniqueTag();
  const first = await createUser(page, `Asesora Uno ${tag}`);
  const second = await createUser(page, `Asesor Dos ${tag}`);

  let sheet = await editUser(page, first);
  await sheet.getByLabel('Asesor por defecto para asignaciones').check();
  await sheet.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados')).toBeVisible();

  sheet = await editUser(page, second);
  await sheet.getByLabel('Asesor por defecto para asignaciones').check();
  await sheet.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados')).toBeVisible();

  // Marcar al segundo se lo sacó al primero.
  sheet = await editUser(page, first);
  await expect(sheet.getByLabel('Asesor por defecto para asignaciones')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await page.goto(`/mi-empresa/usuarios?q=${encodeURIComponent(second)}`);
  await expect(page.getByText('Asesor por defecto', { exact: true })).toBeVisible();
});

test('a saved search with auto-send keeps its frequency', async ({ page }) => {
  const contact = await createContact(page);
  await openContactTab(page, 'Búsquedas');
  await page.getByRole('button', { name: 'Nueva búsqueda' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nueva búsqueda' });

  // La frecuencia aparece al prender el envío automático.
  await expect(sheet.getByLabel('Frecuencia del resumen')).toHaveCount(0);
  await sheet.getByLabel('Envío automático').click();
  await sheet.getByLabel('Frecuencia del resumen').click();
  await page.getByRole('option', { name: 'Cada 3 días' }).click();
  await sheet.getByRole('button', { name: 'Guardar búsqueda' }).click();
  await expect(page.getByText('Búsqueda guardada')).toBeVisible();

  await expect(page.getByRole('cell', { name: /Activo\s*Cada 3 días/ })).toBeVisible();
  expect(contact.id).toMatch(/^[0-9a-f-]{36}$/);
});
