import { expect, test as setup } from '@playwright/test';

import { firstName, ROLES, seedUser, storageStateFor } from './support/users';

// Una sesión por rol, una sola vez por corrida: en producción Better Auth limita los ingresos a 5
// por minuto, así que los specs reusan estas sesiones en lugar de ingresar cada vez.
for (const role of ROLES) {
  setup(`ingresa como ${role}`, async ({ page }) => {
    const user = seedUser(role);
    await page.goto('/ingresar');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // Es la primera pantalla del panel: con `next dev` y sin caché, compilarla lleva más tiempo.
    await expect(page.getByRole('heading', { name: `Hola, ${firstName(role)}` })).toBeVisible({
      timeout: 60_000,
    });
    await page.context().storageState({ path: storageStateFor(role) });
  });
}
