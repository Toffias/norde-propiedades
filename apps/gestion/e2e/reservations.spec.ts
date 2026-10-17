import { expect, test, type Page } from '@playwright/test';

import { pickOption } from './support/appraisals';
import { createContact, type CreatedContact } from './support/clients';
import { changeStatus } from './support/menus';
import {
  createProperty,
  openProperty,
  stubPropertyPhotos,
  type CreatedProperty,
} from './support/properties';
import { storageStateFor } from './support/users';

// Reservas (#13). Se reserva desde la ficha de una propiedad disponible: cada test crea la suya
// (como admin la pasa a disponible) y el contacto que reserva.

test.use({ storageState: storageStateFor('admin') });

test.beforeEach(async ({ page }) => {
  await stubPropertyPhotos(page);
});

/** Una propiedad propia, disponible, con la ficha abierta. */
async function availableProperty(page: Page): Promise<CreatedProperty> {
  const property = await createProperty(page, { price: '150000' });
  await openProperty(page, property.code);
  await changeStatus(page, 'Disponible', 'Ahora está disponible.');

  return property;
}

/** Reserva la propiedad abierta para el contacto, con un valor de seña. */
async function reserve(page: Page, property: CreatedProperty, contact: CreatedContact) {
  await page.getByRole('button', { name: 'Reservar' }).click();
  const dialog = page.getByRole('dialog', { name: `Reservar ${property.code}` });
  await pickOption(page, dialog.getByRole('combobox', { name: 'Contacto' }), {
    label: 'Buscar contacto',
    text: contact.name,
  });
  await dialog.getByLabel('Valor (opcional)').fill('5000');
  await dialog.getByLabel('Fecha estimada de firma').fill('2026-12-15');
  await dialog.getByRole('button', { name: 'Reservar' }).click();
  await expect(page.getByText(`${property.code} quedó reservada`)).toBeVisible();
}

async function reservedProperty(page: Page) {
  const contact = await createContact(page);
  const property = await availableProperty(page);
  await reserve(page, property, contact);
  return { property, contact };
}

test.describe('reservar', () => {
  test('pide el contacto', async ({ page }) => {
    const property = await availableProperty(page);

    await page.getByRole('button', { name: 'Reservar' }).click();
    const dialog = page.getByRole('dialog', { name: `Reservar ${property.code}` });
    await dialog.getByRole('button', { name: 'Reservar' }).click();

    await expect(dialog.getByText('Elegí un contacto.')).toBeVisible();
  });

  test('la propiedad queda reservada y el estado solo cambia con la reserva', async ({ page }) => {
    const { contact } = await reservedProperty(page);

    await expect(page.getByText('Reservada', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reservar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar estado' })).toBeDisabled();
    const card = page.locator('[data-slot="card"]').filter({
      has: page.getByRole('heading', { level: 2, name: 'Reserva' }),
    });
    await expect(card.getByText('Activa')).toBeVisible();
    await expect(card.getByRole('link', { name: contact.name })).toBeVisible();
  });

  test('aparece en el listado de reservas y en la pestaña de la propiedad', async ({ page }) => {
    const { property, contact } = await reservedProperty(page);

    await page.goto('/reservas?status=active');
    const row = page
      .getByRole('table', { name: 'Reservas' })
      .getByRole('row')
      .filter({ hasText: property.code });
    await expect(row.getByRole('link', { name: contact.name })).toBeVisible();
    await expect(row.getByText('Activa')).toBeVisible();

    await row.getByRole('link', { name: property.code, exact: true }).click();
    await expect(page).toHaveURL(/\/propiedades\/[0-9a-f-]{36}\?tab=reservas/);
    await expect(page.getByRole('table', { name: 'Reservas de la propiedad' })).toContainText(
      contact.name,
    );
  });
});

test.describe('caída y firma', () => {
  test('se da por caída y la propiedad vuelve a estar disponible', async ({ page }) => {
    await reservedProperty(page);

    await page.getByRole('button', { name: 'Dar por caída' }).click();
    const dialog = page.getByRole('dialog', { name: 'Dar por caída la reserva' });
    await dialog.getByLabel('Motivo (opcional)').fill('No consiguió el crédito');
    await dialog.getByRole('button', { name: 'Dar por caída' }).click();

    await expect(
      page.getByText('Reserva caída: la propiedad vuelve a estar disponible'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reservar' })).toBeVisible();
    await page.goto(`${page.url().split('?')[0] ?? ''}?tab=historial`);
    const history = page.getByRole('table', { name: 'Historial de la propiedad' });
    await expect(history.getByText('reservó la propiedad')).toBeVisible();
    await expect(history.getByText('dio por caída la reserva')).toBeVisible();
  });

  test('se firma y la propiedad queda vendida', async ({ page }) => {
    await reservedProperty(page);

    await page.getByRole('button', { name: 'Firmar' }).click();
    await page
      .getByRole('dialog', { name: 'Firmar la reserva' })
      .getByRole('button', { name: 'Firmar' })
      .click();

    await expect(page.getByText('Reserva firmada: la propiedad quedó vendida')).toBeVisible();
    await expect(page.getByText('Vendida', { exact: true }).first()).toBeVisible();
  });

  test('edita la fecha estimada de firma', async ({ page }) => {
    await reservedProperty(page);

    await page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Reserva' }) })
      .getByRole('button', { name: 'Editar' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Editar la reserva' });
    await dialog.getByLabel('Fecha estimada de firma').fill('2027-01-20');
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Reserva actualizada')).toBeVisible();
  });
});

test.describe('permisos', () => {
  test('el agente reserva, pero no da por caída ni firma', async ({ page, browser }) => {
    const property = await availableProperty(page);
    const agent = await browser.newContext({ storageState: storageStateFor('agent') });
    const agentPage = await agent.newPage();
    await stubPropertyPhotos(agentPage);
    // El selector de contactos del agente solo muestra los suyos.
    const contact = await createContact(agentPage);

    await openProperty(agentPage, property.code);
    await reserve(agentPage, property, contact);

    await expect(agentPage.getByText('Activa')).toBeVisible();
    for (const action of ['Dar por caída', 'Firmar']) {
      await expect(agentPage.getByRole('button', { name: action })).toHaveCount(0);
    }
    await agentPage.goto('/reservas');
    await expect(agentPage.getByRole('button', { name: 'Exportar a Excel' })).toHaveCount(0);
    await agent.close();
  });

  test('alquileres no ve las reservas', async ({ browser }) => {
    const rentals = await browser.newContext({ storageState: storageStateFor('rentals-admin') });
    const page = await rentals.newPage();

    await page.goto('/reservas');

    await expect(page.getByText('No tenés permiso para ver las reservas.')).toBeVisible();
    await rentals.close();
  });
});

test('exporta las reservas a Excel', async ({ page }) => {
  await reservedProperty(page);
  await page.goto('/reservas?status=active');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar a Excel' }).click();

  expect((await download).suggestedFilename()).toMatch(/^reservas-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
