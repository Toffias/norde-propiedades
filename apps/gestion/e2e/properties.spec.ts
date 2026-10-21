import { expect, test } from '@playwright/test';

import { changeStatus } from './support/menus';
import {
  createProperty,
  detailSection,
  openProperty,
  PNG_1X1,
  stubPropertyPhotos,
} from './support/properties';
import { storageStateFor } from './support/users';

// Propiedades (#5, #6) con la sesión del administrador. El seed tiene 28 propiedades disponibles
// (P-001 a P-028); lo que se crea, cambia o borra lo crea cada test.

test.use({ storageState: storageStateFor('admin') });

test.beforeEach(async ({ page }) => {
  await stubPropertyPhotos(page);
});

const table = 'Propiedades';

test.describe('listado', () => {
  test('busca por código', async ({ page }) => {
    await page.goto('/propiedades');
    await page
      .getByRole('textbox', { name: 'Buscar por código, título o dirección' })
      .fill('P-013');

    await expect(page).toHaveURL(/[?&]q=P-013/);
    const grid = page.getByRole('table', { name: table });
    await expect(grid.getByRole('link', { name: 'P-013', exact: true })).toBeVisible();
    await expect(grid.getByRole('row')).toHaveCount(2);
  });

  test('filtra por tipo de propiedad', async ({ page }) => {
    await page.goto('/propiedades');
    await page.getByRole('combobox', { name: 'Tipo de propiedad' }).click();
    await page.getByRole('option', { name: 'Oficina' }).click();

    await expect(page).toHaveURL(/[?&]propertyType=office/);
    const grid = page.getByRole('table', { name: table });
    await expect(grid.getByRole('link', { name: 'P-008', exact: true })).toBeVisible();
    await expect(grid.getByRole('row')).toHaveCount(2);
  });

  test('filtra por barrio, localidad o provincia', async ({ page }) => {
    await page.goto('/propiedades');
    await page.getByRole('textbox', { name: 'Barrio, localidad o provincia' }).fill('Palermo');

    await expect(page).toHaveURL(/[?&]location=Palermo/);
    const grid = page.getByRole('table', { name: table });
    await expect(grid.getByRole('link', { name: 'P-001', exact: true })).toBeVisible();
    await expect(grid.getByRole('link', { name: 'P-002', exact: true })).toBeVisible();
    // Solo dos del seed (P-0xx) son de Palermo. Las unidades que crean los specs de emprendimientos
    // también pueden estar en Palermo: se cuentan solo las del seed.
    await expect(grid.getByRole('link', { name: /^P-\d{3}$/ })).toHaveCount(2);
  });

  test('sin resultados lo dice', async ({ page }) => {
    await page.goto('/propiedades?q=no-existe-ninguna');

    await expect(page.getByText('No hay propiedades que coincidan con los filtros.')).toBeVisible();
  });

  test('pagina en el servidor', async ({ page }) => {
    await page.goto('/propiedades?pageSize=10');
    await expect(page.getByText(/^Página 1 de \d+$/)).toBeVisible();
    await expect(page.getByRole('table', { name: table }).getByRole('row')).toHaveCount(11);

    await page.getByRole('button', { name: 'Página siguiente' }).click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByText(/^Página 2 de \d+$/)).toBeVisible();
  });

  test('ordena por código', async ({ page }) => {
    await page.goto('/propiedades?q=P-00');
    await page.getByRole('button', { name: 'Código' }).click();

    await expect(page).toHaveURL(/[?&]sort=code/);
    const firstCode = page.getByRole('table', { name: table }).getByRole('row').nth(1);
    await expect(firstCode.getByRole('link', { name: 'P-001', exact: true })).toBeVisible();
  });

  test('compara dos propiedades', async ({ page }) => {
    await page.goto('/propiedades?q=P-01&sort=code');
    const rows = page.getByRole('table', { name: table }).getByRole('row');
    await rows.nth(1).getByRole('checkbox', { name: 'Seleccionar fila' }).check();
    await rows.nth(2).getByRole('checkbox', { name: 'Seleccionar fila' }).check();

    await page.getByRole('button', { name: 'Comparar' }).click();

    await expect(page).toHaveURL(/\/propiedades\/comparar\?ids=/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Comparar propiedades' }),
    ).toBeVisible();
    const comparison = page.getByRole('table', { name: 'Comparación de propiedades' });
    await expect(comparison.getByText('P-010', { exact: false })).toBeVisible();
    await expect(comparison.getByText('P-011', { exact: false })).toBeVisible();
  });

  test('exporta la selección a CSV', async ({ page }) => {
    await page.goto('/propiedades?q=P-013');
    await page.getByRole('checkbox', { name: 'Seleccionar fila' }).first().check();
    await page.getByRole('button', { name: 'Exportar' }).click();

    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'CSV' }).click();

    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  });
});

test.describe('alta', () => {
  test('pide la calle y la ubicación', async ({ page }) => {
    await page.goto('/propiedades?panel=new');
    const sheet = page.getByRole('dialog', { name: 'Nueva propiedad' });

    await sheet.getByRole('button', { name: 'Crear propiedad' }).click();
    await expect(sheet.getByText('Completá este campo.')).toBeVisible();

    // La ubicación se valida cuando el resto del formulario ya es válido.
    await sheet.getByLabel('Calle', { exact: true }).fill('Calle sin ubicación');
    await sheet.getByRole('button', { name: 'Crear propiedad' }).click();
    await expect(
      sheet.getByText('Elegí la ubicación en el buscador o cargala a mano.'),
    ).toBeVisible();
  });

  test('crea un borrador que aparece en el listado', async ({ page }) => {
    const created = await createProperty(page, { price: '150000' });

    await page.goto(`/propiedades?q=${encodeURIComponent(created.street)}`);
    const row = page.getByRole('table', { name: table }).getByRole('row').nth(1);
    await expect(row.getByRole('link', { name: created.code, exact: true })).toBeVisible();
    await expect(row.getByText('Borrador')).toBeVisible();
    await expect(row.getByText('US$ 150.000')).toBeVisible();
  });
});

test.describe('ficha', () => {
  test('muestra el título y las pestañas', async ({ page }) => {
    const created = await createProperty(page);
    await openProperty(page, created.code);

    await expect(page.getByRole('heading', { level: 1, name: created.title })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Secciones de la ficha' });
    for (const tab of ['Detalles', 'Multimedia', 'Archivos', 'Historial']) {
      await expect(tabs.getByRole('link', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
  });

  test('cambia el estado y queda en el historial', async ({ page }) => {
    const created = await createProperty(page);
    await openProperty(page, created.code);

    // Un borrador pasa a disponible y, recién ahí, se puede pausar.
    await changeStatus(page, 'Disponible', 'Ahora está disponible.');
    await changeStatus(page, 'Pausada', 'Ahora está pausada.');

    await page
      .getByRole('navigation', { name: 'Secciones de la ficha' })
      .getByRole('link', { name: 'Historial' })
      .click();
    const history = page.getByRole('table', { name: 'Historial de la propiedad' });
    await expect(history.getByText('cambió el estado')).toHaveCount(2);
    await expect(history.getByText(/Borrador\s*→\s*Disponible/)).toBeVisible();
    await expect(history.getByText(/Disponible\s*→\s*Pausada/)).toBeVisible();
    await expect(history.getByText('dio de alta la propiedad')).toBeVisible();
  });

  test('edita el precio en el lugar y queda en el historial', async ({ page }) => {
    const created = await createProperty(page, { price: '120000' });
    await openProperty(page, created.code);

    const operations = detailSection(page, 'Operaciones y precios');
    await operations.getByRole('button', { name: 'Editar' }).click();
    await operations.getByLabel('Precio', { exact: true }).fill('115000');
    await operations.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Operaciones guardadas.')).toBeVisible();
    await expect(operations.getByText('US$ 115.000')).toBeVisible();
    await page.goto(`${page.url().split('?')[0] ?? ''}?tab=historial`);
    // Los montos llevan un espacio duro entre la moneda y el número.
    await expect(
      page.getByRole('listitem').filter({ hasText: /US\$\s120\.000\s*→\s*Venta US\$\s115\.000/ }),
    ).toBeVisible();
  });

  test('sube una foto', async ({ page }) => {
    const created = await createProperty(page);
    await openProperty(page, created.code);
    await page.goto(`${page.url().split('?')[0] ?? ''}?tab=multimedia`);
    await expect(page.getByText('Todavía no hay fotos.')).toBeVisible();

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: 'frente.png', mimeType: 'image/png', buffer: PNG_1X1 });

    // La foto aparece enseguida como una tarjeta de la galería, y queda cuando llega la del servidor.
    await expect(
      page.getByRole('img', { name: 'frente.png' }).or(page.getByRole('img', { name: 'Foto' })),
    ).toBeVisible();
    await expect(page.getByText(/Fotos y planos \(1\)/)).toBeVisible();
    await expect(page.getByText('No se pudo subir')).toBeHidden();
  });
});

test.describe('papelera', () => {
  test('borra desde el listado y restaura desde la papelera', async ({ page }) => {
    const created = await createProperty(page);
    await page.goto(`/propiedades?q=${encodeURIComponent(created.code)}`);

    await page.getByRole('button', { name: 'Borrar' }).click();
    const confirmBorrar = page.getByRole('dialog', { name: 'Borrar propiedad' });
    await expect(confirmBorrar.getByText(`${created.code} va a la papelera`)).toBeVisible();
    await confirmBorrar.getByRole('button', { name: 'Borrar' }).click();
    await expect(page.getByText('Propiedad enviada a la papelera')).toBeVisible();
    await expect(page.getByText('No hay propiedades que coincidan con los filtros.')).toBeVisible();

    await page.goto(`/propiedades?view=trash&q=${encodeURIComponent(created.code)}`);
    const trash = page.getByRole('table', { name: 'Papelera de propiedades' });
    await expect(trash.getByText(created.code)).toBeVisible();
    await page.getByRole('button', { name: 'Restaurar' }).click();
    await page
      .getByRole('dialog', { name: 'Restaurar propiedad' })
      .getByRole('button', { name: 'Restaurar' })
      .click();
    await expect(page.getByText('Propiedad restaurada')).toBeVisible();

    await page.goto(`/propiedades?q=${encodeURIComponent(created.code)}`);
    await expect(
      page
        .getByRole('table', { name: table })
        .getByRole('link', { name: created.code, exact: true }),
    ).toBeVisible();
  });
});
