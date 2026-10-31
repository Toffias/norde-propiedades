import { expect, test } from '@playwright/test';

import { changeAppraisalStatus, createAppraisal, saveSaleValue } from './support/appraisals';
import { PNG_1X1 } from './support/properties';
import { storageStateFor } from './support/users';

// Tasaciones (#12) con la sesión del administrador. No hay tasaciones en el seed: cada test crea
// la suya, con un contacto propio como solicitante.

test.use({ storageState: storageStateFor('admin') });

test.describe('alta', () => {
  test('pide el solicitante', async ({ page }) => {
    await page.goto('/tasaciones');
    await page.getByRole('button', { name: 'Nueva tasación' }).click();

    await page.getByRole('button', { name: 'Cargar tasación' }).click();

    await expect(page.getByText('Elegí el contacto que pide la tasación.')).toBeVisible();
  });

  test('carga la tasación como solicitada y aparece en el listado', async ({ page }) => {
    const appraisal = await createAppraisal(page);

    await expect(
      page.getByRole('heading', { level: 1, name: `Tasación ${appraisal.code}` }),
    ).toBeVisible();
    await expect(page.getByText('Solicitada', { exact: true }).first()).toBeVisible();

    await page.goto('/tasaciones?status=pending');
    const grid = page.getByRole('table', { name: 'Tasaciones' });
    await expect(grid.getByRole('link', { name: appraisal.code, exact: true })).toBeVisible();
  });
});

test.describe('ficha', () => {
  test('no se marca tasada sin un valor sugerido', async ({ page }) => {
    await createAppraisal(page);

    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await page.getByRole('menuitem', { name: 'Marcar tasada' }).click();

    await expect(
      page.getByText(/Para marcarla tasada hace falta un valor sugerido de venta o de alquiler/),
    ).toBeVisible();
  });

  test('carga el resultado, la marca tasada y descarga el PDF', async ({ page }) => {
    const appraisal = await createAppraisal(page);

    await saveSaleValue(page, appraisal, { min: '110000', max: '120000' });
    await expect(page.getByText(/US\$\s110\.000 a US\$\s120\.000/)).toBeVisible();
    await changeAppraisalStatus(page, 'Marcar tasada', 'Ahora está tasada.');

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Descargar PDF' }).click();
    expect((await download).suggestedFilename()).toBe(`Tasacion-${appraisal.code}.pdf`);
  });

  test('valida el rango del valor sugerido', async ({ page }) => {
    const appraisal = await createAppraisal(page);

    await page.goto(`/tasaciones/${appraisal.id}?tab=resultado`);
    await page.getByRole('button', { name: 'Editar' }).click();
    const sale = page.getByRole('group', { name: 'Valor sugerido de venta' });
    await sale.getByLabel('Mínimo').fill('130000');
    await sale.getByLabel('Máximo').fill('120000');
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('El mínimo no puede superar al máximo.')).toBeVisible();
  });

  test('descarta y vuelve a solicitada', async ({ page }) => {
    await createAppraisal(page);

    await changeAppraisalStatus(page, 'Descartar', 'Ahora está descartada.');
    await changeAppraisalStatus(page, 'Volver a solicitada', 'Ahora está solicitada.');
  });

  test('sube una foto de la visita', async ({ page }) => {
    const appraisal = await createAppraisal(page);
    await page.goto(`/tasaciones/${appraisal.id}?tab=fotos`);
    await expect(page.getByText('Todavía no hay fotos de la visita.')).toBeVisible();

    await page.getByRole('button', { name: 'Agregar fotos' }).click();
    await page
      .getByRole('dialog')
      .locator('input[type="file"]')
      .setInputFiles({ name: 'living.png', mimeType: 'image/png', buffer: PNG_1X1 });

    await expect(page.getByRole('heading', { level: 2, name: 'Fotos (1)' })).toBeVisible();
  });

  test('se convierte en una propiedad en borrador', async ({ page }) => {
    const appraisal = await createAppraisal(page);
    await saveSaleValue(page, appraisal, { min: '95000', max: '100000' });
    await changeAppraisalStatus(page, 'Marcar tasada', 'Ahora está tasada.');

    await page.getByRole('button', { name: 'Convertir en propiedad' }).click();
    await page
      .getByRole('dialog', { name: 'Convertir en propiedad' })
      .getByRole('button', { name: 'Convertir' })
      .click();
    await expect(page.getByText('Tasación convertida: la propiedad se está creando')).toBeVisible();

    // La propiedad la crea un job: la ficha se refresca sola hasta que aparece.
    const created = page.getByText(/^Ingresó como /);
    await expect(created).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Ingresada', { exact: true }).first()).toBeVisible();
    await created.getByRole('link').click();
    await expect(page).toHaveURL(/\/propiedades\/[0-9a-f-]{36}/);
    await expect(page.getByText('Borrador', { exact: true }).first()).toBeVisible();
  });
});

test.describe('papelera', () => {
  test('borra desde la ficha y restaura desde la papelera', async ({ page }) => {
    const appraisal = await createAppraisal(page);

    await page.getByRole('button', { name: 'Borrar tasación' }).click();
    await page
      .getByRole('dialog', { name: 'Borrar tasación' })
      .getByRole('button', { name: 'Borrar' })
      .click();
    await expect(page.getByText('Tasación enviada a la papelera')).toBeVisible();

    await page.goto('/tasaciones?view=trash');
    const row = page
      .getByRole('table', { name: 'Papelera de tasaciones' })
      .getByRole('row')
      .filter({ hasText: appraisal.code });
    await row.getByRole('button', { name: 'Restaurar' }).click();
    await page
      .getByRole('dialog', { name: 'Restaurar tasación' })
      .getByRole('button', { name: 'Restaurar' })
      .click();
    await expect(page.getByText('Tasación restaurada')).toBeVisible();
  });
});

test.describe('permisos', () => {
  test('el agente ve las suyas y no las de otros', async ({ page, browser }) => {
    const othersAppraisal = await createAppraisal(page);
    const agent = await browser.newContext({ storageState: storageStateFor('agent') });
    const agentPage = await agent.newPage();

    const own = await createAppraisal(agentPage);
    await expect(agentPage.getByRole('link', { name: 'Historial' })).toHaveCount(0);
    await expect(agentPage.getByRole('button', { name: 'Borrar tasación' })).toHaveCount(0);

    // La ficha ajena da "no encontrada". Next responde 200 porque el layout ya empezó a
    // transmitirse: se verifica el contenido, no el status.
    await agentPage.goto(`/tasaciones/${othersAppraisal.id}`);
    await expect(agentPage.getByText(/could not be found|no (se )?encontr/i)).toBeVisible();
    await expect(
      agentPage.getByRole('heading', { name: `Tasación ${othersAppraisal.code}` }),
    ).toHaveCount(0);
    await agentPage.goto('/tasaciones');
    await expect(agentPage.getByRole('link', { name: own.code, exact: true })).toBeVisible();
    await expect(
      agentPage.getByRole('link', { name: othersAppraisal.code, exact: true }),
    ).toHaveCount(0);
    await agent.close();
  });

  test('alquileres no ve las tasaciones', async ({ browser }) => {
    const rentals = await browser.newContext({ storageState: storageStateFor('rentals-admin') });
    const page = await rentals.newPage();

    await page.goto('/tasaciones');

    await expect(page.getByText('No tenés permiso para ver las tasaciones.')).toBeVisible();
    await rentals.close();
  });
});
