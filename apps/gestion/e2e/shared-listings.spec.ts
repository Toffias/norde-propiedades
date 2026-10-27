import { expect, test } from '@playwright/test';

import { createContact, openContactTab } from './support/clients';
import { storageStateFor } from './support/users';

// Envíos de propiedades a un contacto (#104) con la sesión del administrador: se destaca una
// propiedad del seed (publicada en la web), se envía por WhatsApp y se revoca el link.

test.use({ storageState: storageStateFor('admin') });

test('envía una destacada por WhatsApp, queda en Envíos y se revoca', async ({ page, context }) => {
  // El link `wa.me` no sale a internet: se responde acá.
  await context.route(/^https:\/\/wa\.me\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }),
  );
  const contact = await createContact(page);

  await openContactTab(page, 'Ofrecer');
  await page.getByLabel('Buscar propiedades').fill('P-001');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: 'Destacar P-001 para este contacto' }).click();
  await expect(page.getByText('P-001 destacada')).toBeVisible();

  await openContactTab(page, 'Destacadas');
  await page.getByRole('button', { name: 'Enviar por WhatsApp' }).click();
  const dialog = page.getByRole('dialog', { name: 'Enviar P-001' });
  await expect(dialog.getByLabel('Mensaje')).toHaveValue(/Te comparto/);
  const popup = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Abrir WhatsApp' }).click();

  const whatsapp = await popup;
  await expect(whatsapp).toHaveURL(/^https:\/\/wa\.me\/549\d+\?text=/);
  const text = decodeURIComponent(new URL(whatsapp.url()).searchParams.get('text') ?? '');
  expect(text).toMatch(/\/e\/[A-Za-z0-9_-]{43}$/);
  await whatsapp.close();

  await openContactTab(page, 'Envíos');
  const sends = page.getByRole('table', { name: 'Envíos' });
  await expect(sends.getByRole('link', { name: 'P-001' })).toBeVisible();
  await expect(sends.getByText('Sin abrir')).toBeVisible();
  await expect(sends.getByText('Vigente')).toBeVisible();

  await sends.getByRole('button', { name: 'Revocar link' }).click();
  await page
    .getByRole('dialog', { name: 'Revocar link' })
    .getByRole('button', { name: 'Revocar' })
    .click();
  await expect(page.getByText('Link revocado')).toBeVisible();
  await expect(sends.getByText('Revocado')).toBeVisible();

  await openContactTab(page, 'Actividad');
  await expect(
    page
      .getByRole('table', { name: 'Actividad del contacto' })
      .getByText('Se le enviaron una propiedad por WhatsApp'),
  ).toBeVisible();
  expect(contact.id).toMatch(/[0-9a-f-]{36}/);
});
