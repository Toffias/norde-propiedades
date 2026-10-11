import { expect, test } from '@playwright/test';

import {
  createProperty,
  detailSection,
  openProperty,
  stubPropertyPhotos,
} from './support/properties';
import { storageStateFor } from './support/users';

// Lo que cada rol puede hacer con las propiedades. La regla la aplica el caso de uso; acá se prueba
// que el panel la refleje.

test.beforeEach(async ({ page }) => {
  await stubPropertyPhotos(page);
});

test.describe('agente', () => {
  test.use({ storageState: storageStateFor('agent') });

  test('no puede borrar ni ver la papelera', async ({ page }) => {
    await page.goto('/propiedades?q=P-013');

    await expect(page.getByRole('link', { name: 'P-013', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Borrar' })).toHaveCount(0);
    await page.getByRole('button', { name: /^Más filtros/ }).click();
    await expect(page.getByText('Qué ver')).toHaveCount(0);
  });

  test('edita la propiedad que capta, pero no las de otros', async ({ page }) => {
    const created = await createProperty(page);
    await openProperty(page, created.code);
    await expect(
      detailSection(page, 'Operaciones y precios').getByRole('button', { name: 'Editar' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar estado' })).toBeVisible();

    await openProperty(page, 'P-013');
    await expect(
      detailSection(page, 'Operaciones y precios').getByRole('button', { name: 'Editar' }),
    ).toHaveCount(0);
  });

  test('no puede marcar disponible su propiedad', async ({ page }) => {
    const created = await createProperty(page);
    await openProperty(page, created.code);

    await page.getByRole('button', { name: 'Cambiar estado' }).click();

    await expect(page.getByRole('menuitem', { name: 'Pausada' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Disponible' })).toHaveCount(0);
  });

  test('no ve el historial', async ({ page }) => {
    await openProperty(page, 'P-013');
    await page.goto(`${page.url().split('?')[0] ?? ''}?tab=historial`);

    await expect(page.getByText('No tenés permiso para ver esta información.')).toBeVisible();
  });
});

test.describe('administrativo de alquileres', () => {
  test.use({ storageState: storageStateFor('rentals-admin') });

  test('ve la cartera pero no da de alta ni edita', async ({ page }) => {
    await page.goto('/propiedades');
    await expect(page.getByRole('heading', { level: 1, name: 'Propiedades' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva propiedad' })).toHaveCount(0);

    await openProperty(page, 'P-013');
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar estado' })).toHaveCount(0);
  });
});
