import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

// Propiedades creadas desde el panel, como lo hace el equipo. Cada spec crea las suyas con una marca
// única: los specs corren en paralelo y el seed es de solo lectura.

export interface CreatedProperty {
  readonly code: string;
  readonly street: string;
  readonly title: string;
}

export interface NewProperty {
  /** Precio sin puntos de miles; en dólares (la moneda por defecto del alta). */
  readonly price?: string;
}

/** Un PNG válido de 1 × 1 píxel. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Responde las miniaturas de las propiedades con una imagen fija. Las fotos del seed son links
 * externos, y con varios specs en paralelo cada listado pide 25 miniaturas que frenan las acciones
 * del panel (#75). Los specs de fotos prueban la subida, no la entrega.
 */
export async function stubPropertyPhotos(page: Page): Promise<void> {
  await page.route(/\/propiedades\/[0-9a-f-]{36}\/fotos\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 }),
  );
}

/** Una marca corta y única para los datos que crea un spec. */
export function uniqueTag(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Da de alta una propiedad desde el panel lateral del listado. Lleva coordenadas para que el alta no
 * consulte el geocodificador, y la ubicación cargada a mano para no sumarse a los barrios del seed.
 */
export async function createProperty(
  page: Page,
  input: NewProperty = {},
): Promise<CreatedProperty> {
  const tag = uniqueTag();
  const street = `Calle E2E ${tag}`;
  const title = `Departamento de prueba ${tag}`;

  await page.goto('/propiedades?panel=new');
  const sheet = page.getByRole('dialog', { name: 'Nueva propiedad' });
  if (input.price !== undefined) await sheet.getByLabel('Precio (opcional)').fill(input.price);
  await sheet.getByLabel('Calle', { exact: true }).fill(street);
  await sheet.getByLabel('Altura (opcional)').fill('1234');
  await sheet.getByRole('button', { name: 'Cargar la ubicación a mano' }).click();
  await sheet.getByLabel('Barrio', { exact: true }).fill(`Barrio E2E ${tag}`);
  await sheet.getByLabel('Localidad', { exact: true }).fill('Ciudad de Buenos Aires');
  await sheet.getByLabel('Provincia', { exact: true }).fill('Buenos Aires');
  await sheet.getByLabel('Título para portales (opcional)').fill(title);
  await sheet.getByLabel('Latitud (opcional)').fill('-34.5875');
  await sheet.getByLabel('Longitud (opcional)').fill('-58.4321');
  await sheet.getByRole('button', { name: 'Crear propiedad' }).click();

  const toast = page.getByText(/^Propiedad \S+ creada como borrador$/);
  await expect(toast).toBeVisible();
  const code = /^Propiedad (\S+) creada/.exec((await toast.textContent()) ?? '')?.[1];
  if (code === undefined) throw new Error('El aviso del alta no trae el código de la propiedad');
  await expect(sheet).toBeHidden();
  return { code, street, title };
}

/** Abre la ficha buscando la propiedad por código en el listado. */
export async function openProperty(page: Page, code: string): Promise<void> {
  await page.goto(`/propiedades?q=${encodeURIComponent(code)}`);
  await page.getByRole('link', { name: code, exact: true }).click();
  await expect(page).toHaveURL(/\/propiedades\/[0-9a-f-]{36}/);
}

/** Una sección de la pestaña Detalles, por su título. */
export function detailSection(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({
    has: page.getByRole('heading', { level: 2, name: title, exact: true }),
  });
}
