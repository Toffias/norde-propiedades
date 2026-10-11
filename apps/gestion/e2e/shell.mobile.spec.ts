import { expect, test } from '@playwright/test';

import { firstName, storageStateFor } from './support/users';

test.use({ storageState: storageStateFor('admin') });

test('en el celular el inicio carga sin scroll horizontal', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: `Hola, ${firstName('admin')}` }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
