import { expect, type Page } from '@playwright/test';

// Menús desplegables (DropdownMenu de Radix). Al elegir una opción el menú se cierra con una
// animación y, mientras dura, sigue montado: toma como de afuera el clic que lo vuelve a abrir y
// se cierra solo. Por eso se espera a que se desmonte antes de seguir.

/**
 * Cambia el estado desde el menú "Cambiar estado" de una ficha y espera el aviso y a que el menú
 * se desmonte.
 */
export async function changeStatus(page: Page, item: string, toast: string): Promise<void> {
  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await expect(page.getByText(toast)).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(0);
}
