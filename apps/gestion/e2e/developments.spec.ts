import { expect, test, type Page } from '@playwright/test';

import { changeStatus } from './support/menus';
import { detailSection, uniqueTag } from './support/properties';
import { storageStateFor } from './support/users';

// Emprendimientos (#7) con la sesión del administrador. No hay emprendimientos en el seed: cada
// test crea el suyo, con coordenadas para no consultar el geocodificador.

test.use({ storageState: storageStateFor('admin') });

interface CreatedDevelopment {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

async function createDevelopment(page: Page): Promise<CreatedDevelopment> {
  const name = `Torre E2E ${uniqueTag()}`;
  await page.goto('/emprendimientos?panel=new');
  const sheet = page.getByRole('dialog', { name: 'Nuevo emprendimiento' });
  await sheet.getByLabel('Nombre público').fill(name);
  await sheet.getByLabel('Dirección (privada)').fill('Honduras 5500');
  // La ubicación sale del catálogo que carga la migración (barrios de CABA).
  await sheet.getByRole('combobox', { name: 'Barrio, localidad o provincia' }).click();
  await page.getByRole('textbox', { name: 'Ej. Palermo' }).fill('Palermo');
  await page
    .getByRole('option', { name: /^Palermo/ })
    .first()
    .click();
  await sheet.getByLabel('Latitud (opcional)').fill('-34.5850');
  await sheet.getByLabel('Longitud (opcional)').fill('-58.4320');
  await sheet.getByRole('button', { name: 'Crear emprendimiento' }).click();

  const toast = page.getByText(/^Emprendimiento \S+ creado$/);
  await expect(toast).toBeVisible();
  const code = /^Emprendimiento (\S+) creado$/.exec((await toast.textContent()) ?? '')?.[1];
  await expect(page).toHaveURL(/\/emprendimientos\/[0-9a-f-]{36}/);
  const id = /\/emprendimientos\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (code === undefined || id === undefined) throw new Error('El alta no llevó a la ficha');
  return { id, code, name };
}

async function addUnit(page: Page, development: CreatedDevelopment): Promise<string> {
  await page.goto(`/emprendimientos/${development.id}?tab=unidades&panel=new`);
  const sheet = page.getByRole('dialog', { name: 'Nueva unidad' });
  await sheet.getByLabel('Ambientes').fill('2');
  await sheet.getByLabel('Piso', { exact: true }).fill('4');
  await sheet.getByLabel('Unidad', { exact: true }).fill('B');
  await sheet.getByLabel('Superficie total (m²)').fill('48');
  await sheet.getByLabel('Superficie cubierta (m²)').fill('44');
  await sheet.getByLabel('Precio (opcional)').fill('98000');
  await sheet.getByRole('button', { name: 'Crear unidad' }).click();

  const toast = page.getByText(/^Unidad \S+ creada como borrador$/);
  await expect(toast).toBeVisible();
  const code = /^Unidad (\S+) creada/.exec((await toast.textContent()) ?? '')?.[1];
  if (code === undefined) throw new Error('El aviso no trae el código de la unidad');
  return code;
}

test.describe('alta', () => {
  test('pide el nombre, la dirección y la ubicación', async ({ page }) => {
    await page.goto('/emprendimientos?panel=new');
    const sheet = page.getByRole('dialog', { name: 'Nuevo emprendimiento' });

    await sheet.getByRole('button', { name: 'Crear emprendimiento' }).click();

    await expect(sheet.getByText('Completá este campo.').first()).toBeVisible();
  });

  test('crea el emprendimiento cargando información y lo encuentra el buscador', async ({
    page,
  }) => {
    const development = await createDevelopment(page);

    await expect(page.getByRole('heading', { level: 1, name: development.name })).toBeVisible();
    await expect(page.getByText('Cargando información').first()).toBeVisible();

    await page.goto(`/emprendimientos?q=${encodeURIComponent(development.name)}`);
    const grid = page.getByRole('table', { name: 'Emprendimientos' });
    await expect(grid.getByRole('link', { name: development.code, exact: true })).toBeVisible();
  });
});

test.describe('ficha', () => {
  test('pasa a comercializando', async ({ page }) => {
    await createDevelopment(page);

    await changeStatus(page, 'Comercializando', 'Ahora está comercializando.');
  });

  test('edita la obra y la entrega', async ({ page }) => {
    await createDevelopment(page);

    const works = detailSection(page, 'Obra, entrega y financiación');
    await works.getByRole('button', { name: 'Editar' }).click();
    await works.getByLabel('Fecha de entrega').fill('2027-12-01');
    await works.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Cambios guardados.')).toBeVisible();
    await expect(works.getByText(/2027/)).toBeVisible();
  });

  test('suma una unidad que hereda el emprendimiento y queda en el historial', async ({ page }) => {
    const development = await createDevelopment(page);

    const unitCode = await addUnit(page, development);

    const units = page.getByRole('table', { name: 'Unidades del emprendimiento' });
    const row = units.getByRole('row').filter({ hasText: unitCode });
    await expect(row.getByText('Borrador')).toBeVisible();
    await expect(row.getByText(/US\$\s98\.000/)).toBeVisible();

    await page.goto(`/emprendimientos/${development.id}?tab=historial`);
    const history = page.getByRole('table', { name: 'Historial del emprendimiento' });
    await expect(history.getByText('sumó una unidad')).toBeVisible();
    await expect(history.getByText('dio de alta el emprendimiento')).toBeVisible();

    await page.goto(`/emprendimientos/${development.id}?tab=unidades`);
    await units.getByRole('link', { name: unitCode, exact: true }).click();
    await expect(page).toHaveURL(/\/propiedades\/[0-9a-f-]{36}/);
  });

  test('no se borra mientras tenga unidades activas', async ({ page }) => {
    const development = await createDevelopment(page);
    await addUnit(page, development);
    await page.goto(`/emprendimientos/${development.id}`);

    await page.getByRole('button', { name: 'Borrar emprendimiento' }).click();
    const dialog = page.getByRole('dialog', { name: 'Borrar emprendimiento' });
    await dialog.getByRole('button', { name: 'Borrar' }).click();

    await expect(
      dialog.getByText('Tiene 1 unidad activa: borrala antes de borrar el emprendimiento.'),
    ).toBeVisible();
  });
});

test.describe('papelera', () => {
  test('borra un emprendimiento sin unidades y lo restaura', async ({ page }) => {
    const development = await createDevelopment(page);

    await page.getByRole('button', { name: 'Borrar emprendimiento' }).click();
    await page
      .getByRole('dialog', { name: 'Borrar emprendimiento' })
      .getByRole('button', { name: 'Borrar' })
      .click();
    await expect(page.getByText('Emprendimiento enviado a la papelera')).toBeVisible();

    await page.goto(`/emprendimientos?view=trash&q=${encodeURIComponent(development.name)}`);
    const trash = page.getByRole('table', { name: 'Papelera de emprendimientos' });
    await trash.getByRole('button', { name: 'Restaurar' }).click();
    await page
      .getByRole('dialog', { name: 'Restaurar emprendimiento' })
      .getByRole('button', { name: 'Restaurar' })
      .click();
    await expect(page.getByText('Emprendimiento restaurado')).toBeVisible();
  });
});

test.describe('permisos', () => {
  test('el agente solo los consulta', async ({ page, browser }) => {
    const development = await createDevelopment(page);
    await addUnit(page, development);
    const agent = await browser.newContext({ storageState: storageStateFor('agent') });
    const agentPage = await agent.newPage();

    await agentPage.goto('/emprendimientos');
    await expect(agentPage.getByRole('button', { name: 'Nuevo emprendimiento' })).toHaveCount(0);
    await expect(agentPage.getByRole('button', { name: 'Papelera' })).toHaveCount(0);

    await agentPage.goto(`/emprendimientos/${development.id}?tab=unidades`);
    await expect(
      agentPage.getByRole('heading', { level: 1, name: development.name }),
    ).toBeVisible();
    await expect(agentPage.getByRole('button', { name: 'Cambiar estado' })).toHaveCount(0);
    await expect(agentPage.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(agentPage.getByRole('link', { name: 'Nueva unidad' })).toHaveCount(0);
    await expect(agentPage.getByRole('button', { name: 'Nueva unidad' })).toHaveCount(0);
    await agent.close();
  });

  test('alquileres no los ve', async ({ browser }) => {
    const rentals = await browser.newContext({ storageState: storageStateFor('rentals-admin') });
    const page = await rentals.newPage();

    await page.goto('/emprendimientos');

    await expect(page.getByText('No tenés permiso para ver estos emprendimientos.')).toBeVisible();
    await rentals.close();
  });
});
