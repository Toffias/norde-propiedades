import { expect, test } from '@playwright/test';

import { createContact, fillNewContact, newPhone, openContactTab } from './support/clients';
import { detailSection, uniqueTag } from './support/properties';
import { storageStateFor } from './support/users';

// Contactos (#8) con la sesión del administrador. El seed no trae contactos: cada test crea los
// suyos.

test.use({ storageState: storageStateFor('admin') });

test.describe('alta', () => {
  test('pide el nombre y un teléfono o email', async ({ page }) => {
    await page.goto('/contactos?panel=new');
    const sheet = page.getByRole('dialog', { name: 'Nuevo contacto' });

    await sheet.getByRole('button', { name: 'Crear contacto' }).click();

    // El nombre y el teléfono que trae el formulario vacíos.
    await expect(sheet.getByText('Completá este campo.')).toHaveCount(2);
  });

  test('crea el contacto, abre su ficha y aparece en la agenda', async ({ page }) => {
    const contact = await createContact(page);

    await expect(page.getByRole('heading', { level: 1, name: contact.name })).toBeVisible();
    await page.goto(`/contactos?q=${encodeURIComponent(contact.name)}`);
    const grid = page.getByRole('table', { name: 'Contactos' });
    await expect(grid.getByRole('link', { name: contact.name, exact: true })).toBeVisible();
    await expect(grid.getByRole('row')).toHaveCount(2);
  });

  test('no deja cargar dos veces el mismo teléfono', async ({ page }) => {
    const existing = await createContact(page);

    const sheet = await fillNewContact(page, {
      name: `Otro nombre ${uniqueTag()}`,
      phone: existing.phone,
    });
    await sheet.getByRole('button', { name: 'Crear contacto' }).click();

    await expect(
      sheet.getByText(`Ya hay un contacto con ese teléfono o email: ${existing.name}`),
    ).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Crear contacto' })).toBeDisabled();
    await sheet.getByRole('link', { name: 'Abrir su ficha' }).click();
    await expect(page).toHaveURL(new RegExp(`/contactos/${existing.id}`));
  });

  test('avisa un posible duplicado por nombre y deja crearlo igual', async ({ page }) => {
    const existing = await createContact(page);

    const sheet = await fillNewContact(page, { name: existing.name, phone: newPhone() });
    await sheet.getByRole('button', { name: 'Crear contacto' }).click();

    await expect(
      sheet.getByText('Posible duplicado: hay contactos con el mismo nombre.'),
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'Crear igual' }).click();
    await expect(page.getByText('Contacto creado')).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(existing.id));
  });
});

test.describe('ficha', () => {
  test('edita los datos y queda en el historial', async ({ page }) => {
    await createContact(page);
    const company = `Empresa E2E ${uniqueTag()}`;

    const data = detailSection(page, 'Datos');
    await data.getByRole('button', { name: 'Editar' }).click();
    await data.getByLabel('Empresa', { exact: true }).fill(company);
    await data.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Cambios guardados.')).toBeVisible();
    await expect(data.getByText(company)).toBeVisible();
    await openContactTab(page, 'Historial');
    const history = page.getByRole('table', { name: 'Historial del contacto' });
    await expect(history.getByText('editó el contacto')).toBeVisible();
    await expect(history.getByText('dio de alta el contacto')).toBeVisible();
  });

  test('marca los tipos de cliente', async ({ page }) => {
    await createContact(page);

    const types = detailSection(page, 'Tipos de cliente');
    await expect(types.getByText('Sin tipos de cliente.')).toBeVisible();
    await types.getByRole('button', { name: 'Editar' }).click();
    await types.getByLabel('Comprador').check();
    await types.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Tipos de cliente guardados.')).toBeVisible();
    await expect(types.getByText('Comprador')).toBeVisible();
  });

  test('agrega una nota a la actividad', async ({ page }) => {
    await createContact(page);
    const note = `Llamó para coordinar una visita ${uniqueTag()}`;

    await openContactTab(page, 'Actividad');
    await page.getByLabel('Agregar una nota').fill(note);
    await page.getByRole('button', { name: 'Guardar nota' }).click();

    await expect(page.getByText('Nota agregada')).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Actividad del contacto' }).getByText(note),
    ).toBeVisible();
  });

  test('cambia el agente', async ({ page }) => {
    await createContact(page);

    await page.getByRole('button', { name: 'Cambiar agente' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar el agente' });
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: /Camila Agente/ }).click();
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Agente actualizado')).toBeVisible();
    await expect(page.getByText('Camila Agente').first()).toBeVisible();
  });
});

test.describe('papelera', () => {
  test('borra desde la ficha y restaura desde la papelera', async ({ page }) => {
    const contact = await createContact(page);

    await page.getByRole('button', { name: 'Borrar' }).click();
    await page
      .getByRole('dialog', { name: 'Borrar contacto' })
      .getByRole('button', { name: 'Borrar' })
      .click();
    await expect(page.getByText('Contacto enviado a la papelera')).toBeVisible();

    await page.goto(`/contactos?view=trash&q=${encodeURIComponent(contact.name)}`);
    const trash = page.getByRole('table', { name: 'Papelera de contactos' });
    await expect(trash.getByText(contact.name)).toBeVisible();
    await trash.getByRole('button', { name: 'Restaurar' }).click();
    await page
      .getByRole('dialog', { name: 'Restaurar contacto' })
      .getByRole('button', { name: 'Restaurar' })
      .click();
    await expect(page.getByText('Contacto restaurado')).toBeVisible();

    await page.goto(`/contactos?q=${encodeURIComponent(contact.name)}`);
    await expect(
      page
        .getByRole('table', { name: 'Contactos' })
        .getByRole('link', { name: contact.name, exact: true }),
    ).toBeVisible();
  });
});

test.describe('unificar y suprimir', () => {
  test('unifica dos contactos de la misma persona', async ({ page }) => {
    const absorbed = await createContact(page);
    const primary = await createContact(page);

    await page.getByRole('button', { name: 'Unificar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unificar contactos' });
    await dialog.getByRole('combobox').click();
    await page.getByRole('textbox', { name: 'Buscar contacto' }).fill(absorbed.name);
    await page.getByRole('option', { name: new RegExp(absorbed.name) }).click();
    await expect(dialog.getByText('¿Cuál queda?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Unificar' }).click();

    await expect(page.getByText(`Contactos unificados en ${primary.name}`)).toBeVisible();
    await page.goto(`/contactos/${absorbed.id}`);
    await expect(page).toHaveURL(new RegExp(`/contactos/${primary.id}`));
  });

  test('suprime los datos a pedido del cliente (Ley 25.326)', async ({ page }) => {
    const contact = await createContact(page);

    await page.getByRole('button', { name: 'Suprimir datos' }).click();
    const dialog = page.getByRole('dialog', { name: `Suprimir los datos de ${contact.name}` });
    await dialog.getByRole('button', { name: 'Continuar' }).click();
    const confirm = dialog.getByRole('button', { name: 'Suprimir para siempre' });
    await expect(confirm).toBeDisabled();
    await dialog
      .getByLabel('Para confirmar, escribí el nombre del contacto')
      .fill(contact.name.toUpperCase());
    await confirm.click();

    await expect(page.getByText('Se suprimieron los datos del contacto')).toBeVisible();
    await expect(page).toHaveURL(/\/contactos$/);
    // No queda ni en la agenda ni en la papelera.
    for (const view of ['', '&view=trash']) {
      await page.goto(`/contactos?q=${encodeURIComponent(contact.name)}${view}`);
      await expect(
        page.getByText(/La papelera está vacía|No hay contactos que coincidan/),
      ).toBeVisible();
    }
  });
});
