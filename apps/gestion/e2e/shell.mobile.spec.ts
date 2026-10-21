import { expect, test } from '@playwright/test';

import { storageStateFor } from './support/users';

test.use({ storageState: storageStateFor('admin') });

test('en el celular el inicio carga sin scroll horizontal', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
