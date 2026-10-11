import { expect, test, type Page } from '@playwright/test';

import { createContact } from './support/clients';
import { storageStateFor } from './support/users';

// Buscador de la barra superior: contactos, propiedades, emprendimientos y agentes, con los
// permisos de cada módulo.

test.use({ storageState: storageStateFor('admin') });

const SEARCH = 'Buscar contactos, propiedades, emprendimientos o agentes';

function searchBox(page: Page) {
  return page.getByRole('combobox', { name: SEARCH });
}

function results(page: Page) {
  return page.getByRole('listbox', { name: 'Resultados de la búsqueda' });
}

async function search(page: Page, term: string) {
  await page.goto('/');
  await searchBox(page).fill(term);
  return results(page);
}

test('encuentra una propiedad por código y abre su ficha', async ({ page }) => {
  const list = await search(page, 'P-013');

  const option = list.getByRole('region', { name: 'Propiedades' }).getByRole('option', {
    name: /P-013/,
  });
  await option.click();

  await expect(page).toHaveURL(/\/propiedades\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Saavedra');
});

test('encuentra un contacto por nombre y abre su ficha', async ({ page }) => {
  const contact = await createContact(page);

  const list = await search(page, contact.name);
  await list
    .getByRole('region', { name: 'Contactos' })
    .getByRole('option', { name: new RegExp(contact.name) })
    .click();

  await expect(page).toHaveURL(new RegExp(`/contactos/${contact.id}`));
});

test('encuentra un agente del equipo', async ({ page }) => {
  const list = await search(page, 'Camila');

  await expect(
    list.getByRole('region', { name: 'Agentes' }).getByRole('option', { name: /Camila Agente/ }),
  ).toBeVisible();
});

test('"Ver los N" lleva al listado filtrado', async ({ page }) => {
  const list = await search(page, 'P-01');
  const properties = list.getByRole('region', { name: 'Propiedades' });

  await expect(properties.getByRole('option')).toHaveCount(5);
  await properties.getByRole('link', { name: /^Ver los \d+$/ }).click();

  await expect(page).toHaveURL(/\/propiedades\?q=P-01/);
  await expect(page.getByRole('heading', { level: 1, name: 'Propiedades' })).toBeVisible();
});

test('pide dos letras y avisa cuando no encuentra nada', async ({ page }) => {
  await page.goto('/');
  await searchBox(page).fill('P');
  await expect(page.getByText('Escribí al menos dos letras.')).toBeVisible();

  await searchBox(page).fill('zzzz-no-existe');
  await expect(page.getByText('No encontramos nada para "zzzz-no-existe".')).toBeVisible();
});

test('busca solo en los tipos elegidos y lo recuerda', async ({ page }) => {
  await page.goto('/');
  const kinds = page.getByRole('group', { name: 'Buscar en' });
  const contacts = kinds.getByRole('button', { name: 'Contactos' });
  await contacts.click();
  await expect(contacts).toHaveAttribute('aria-pressed', 'true');

  await searchBox(page).fill('P-013');
  await expect(page.getByText('No encontramos nada para "P-013".')).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Buscar en' }).getByRole('button', { name: 'Contactos' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('Ctrl+K lleva al buscador desde cualquier pantalla', async ({ page }) => {
  await page.goto('/propiedades');
  await expect(page.getByRole('heading', { level: 1, name: 'Propiedades' })).toBeVisible();

  await page.keyboard.press('Control+k');

  await expect(searchBox(page)).toBeFocused();
});

test('el agente no encuentra los contactos de otros', async ({ page, browser }) => {
  const othersContact = await createContact(page);
  const agent = await browser.newContext({ storageState: storageStateFor('agent') });
  const agentPage = await agent.newPage();

  await agentPage.goto('/');
  await searchBox(agentPage).fill(othersContact.name);

  await expect(
    agentPage.getByText(`No encontramos nada para "${othersContact.name}".`),
  ).toBeVisible();
  await agent.close();
});
