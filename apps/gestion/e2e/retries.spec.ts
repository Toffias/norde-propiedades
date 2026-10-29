import { expect, test } from '@playwright/test';

import { pickOption } from './support/appraisals';
import { createContact, openContactTab } from './support/clients';
import { changeStatus } from './support/menus';
import { loseNextActionResponse } from './support/network';
import { createProperty, openProperty, stubPropertyPhotos, uniqueTag } from './support/properties';
import { storageStateFor } from './support/users';

// Idas y vueltas de la red (ADR 0050): el alta llega al servidor pero la respuesta se pierde. La
// persona ve el error y vuelve a tocar el botón; el alta no se repite.

test.use({ storageState: storageStateFor('admin') });

const UNEXPECTED = 'Algo salió mal. Probá de nuevo en unos segundos.';

test('una nota guardada cuya respuesta se perdió no se duplica al reintentar', async ({ page }) => {
  await createContact(page);
  const note = `Quedó en mandar los papeles ${uniqueTag()}`;
  await openContactTab(page, 'Actividad');
  await page.getByLabel('Agregar una nota').fill(note);

  await loseNextActionResponse(page, 'idempotencyKey');
  await page.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.getByText(UNEXPECTED)).toBeVisible();

  await page.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.getByText('Nota agregada')).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('table', { name: 'Actividad del contacto' }).getByText(note),
  ).toHaveCount(1);
});

test('una reserva guardada cuya respuesta se perdió se confirma al reintentar', async ({
  page,
}) => {
  await stubPropertyPhotos(page);
  const contact = await createContact(page);
  const property = await createProperty(page, { price: '150000' });
  await openProperty(page, property.code);
  await changeStatus(page, 'Disponible', 'Ahora está disponible.');

  await page.getByRole('button', { name: 'Reservar' }).click();
  const dialog = page.getByRole('dialog', { name: `Reservar ${property.code}` });
  await pickOption(page, dialog.getByRole('combobox', { name: 'Contacto' }), {
    label: 'Buscar contacto',
    text: contact.name,
  });
  await dialog.getByLabel('Fecha estimada de firma').fill('2026-12-15');

  await loseNextActionResponse(page, 'idempotencyKey');
  await dialog.getByRole('button', { name: 'Reservar' }).click();
  await expect(dialog.getByText(UNEXPECTED)).toBeVisible();

  // Antes, el segundo intento chocaba con la reserva ya guardada y mostraba un error.
  await dialog.getByRole('button', { name: 'Reservar' }).click();
  await expect(page.getByText(`${property.code} quedó reservada`)).toBeVisible();

  await page.goto(`${page.url().split('?')[0] ?? ''}?tab=reservas`);
  await expect(
    page.getByRole('table', { name: 'Reservas de la propiedad' }).getByRole('row'),
  ).toHaveCount(2);
});
