import { expect, type Page } from '@playwright/test';

import { createContact, type CreatedContact } from './clients';

// Tasaciones creadas desde el panel. Nacen solicitadas y necesitan un contacto como solicitante:
// cada spec crea el suyo.

export interface CreatedAppraisal {
  readonly id: string;
  readonly code: string;
  readonly requester: CreatedContact;
}

/** Elige una opción en un selector con búsqueda (el combobox de contactos o de usuarios). */
export async function pickOption(
  page: Page,
  combobox: ReturnType<Page['getByRole']>,
  search: { readonly label: string; readonly text: string },
): Promise<void> {
  await combobox.click();
  await page.getByRole('textbox', { name: search.label }).fill(search.text);
  await page.getByRole('option', { name: new RegExp(search.text) }).click();
}

/** Crea un contacto y una tasación pedida por él, y espera su ficha. */
export async function createAppraisal(page: Page): Promise<CreatedAppraisal> {
  const requester = await createContact(page);

  await page.goto('/tasaciones');
  await page.getByRole('button', { name: 'Nueva tasación' }).click();
  await pickOption(page, page.getByRole('combobox', { name: 'Solicitante' }), {
    label: 'Buscar contacto',
    text: requester.name,
  });
  await page.getByLabel('Dirección', { exact: true }).fill('Gurruchaga 1850, 3° B');
  await page.getByLabel('Superficie total (m²)').fill('62');
  await page.getByLabel('Ambientes', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Cargar tasación' }).click();

  const toast = page.getByText(/^Tasación TAS\d+ cargada$/);
  await expect(toast).toBeVisible();
  const code = /^Tasación (TAS\d+) cargada$/.exec((await toast.textContent()) ?? '')?.[1];
  await expect(page).toHaveURL(/\/tasaciones\/[0-9a-f-]{36}$/);
  const id = /\/tasaciones\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (code === undefined || id === undefined) throw new Error('El alta no llevó a la tasación');
  return { id, code, requester };
}

/** Carga el valor sugerido de venta en la pestaña Resultado. */
export async function saveSaleValue(
  page: Page,
  appraisal: CreatedAppraisal,
  value: { readonly min: string; readonly max: string },
): Promise<void> {
  await page.goto(`/tasaciones/${appraisal.id}?tab=resultado`);
  await page.getByRole('button', { name: 'Editar' }).click();
  const sale = page.getByRole('group', { name: 'Valor sugerido de venta' });
  await sale.getByLabel('Mínimo').fill(value.min);
  await sale.getByLabel('Máximo').fill(value.max);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Resultado guardado.')).toBeVisible();
}

/**
 * Cambia el estado desde el menú de la cabecera y espera el aviso y a que el menú se desmonte: se
 * cierra con una animación y, mientras dura, toma como de afuera el clic que lo vuelve a abrir y
 * se cierra solo.
 */
export async function changeAppraisalStatus(
  page: Page,
  item: string,
  toast: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Cambiar estado' }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await expect(page.getByText(toast)).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(0);
}
