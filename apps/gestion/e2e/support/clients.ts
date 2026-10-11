import { randomInt } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { uniqueTag } from './properties';

// Contactos creados desde el panel. El seed no trae contactos: cada spec crea los suyos, con un
// nombre y un teléfono únicos.

export interface CreatedContact {
  readonly id: string;
  readonly name: string;
  /** Como se carga en el formulario: característica y número, sin el 0 ni el 15. */
  readonly phone: string;
}

export interface NewContact {
  readonly name?: string;
  readonly phone?: string;
}

/** Un celular de CABA que no tiene ningún contacto, como lo escribe una persona. */
export function newPhone(): string {
  return `11 ${String(randomInt(1000, 9999))}-${String(randomInt(1000, 9999))}`;
}

/** Abre el alta de contacto y completa el nombre y el teléfono principal. */
export async function fillNewContact(page: Page, contact: Required<NewContact>) {
  await page.goto('/contactos?panel=new');
  const sheet = page.getByRole('dialog', { name: 'Nuevo contacto' });
  await sheet.getByLabel('Nombre', { exact: true }).fill(contact.name);
  await sheet.getByLabel('Número (principal)').fill(contact.phone);
  return sheet;
}

/** Da de alta un contacto desde el panel lateral y espera su ficha. */
export async function createContact(page: Page, input: NewContact = {}): Promise<CreatedContact> {
  const contact = {
    name: input.name ?? `Contacto E2E ${uniqueTag()}`,
    phone: input.phone ?? newPhone(),
  };
  const sheet = await fillNewContact(page, contact);
  await sheet.getByRole('button', { name: 'Crear contacto' }).click();

  await expect(page.getByText('Contacto creado')).toBeVisible();
  await expect(page).toHaveURL(/\/contactos\/[0-9a-f-]{36}$/);
  const id = /\/contactos\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (id === undefined) throw new Error('El alta no llevó a la ficha del contacto');
  return { id, ...contact };
}

/** Una pestaña de la ficha del contacto. El nombre lleva el contador ("Actividad 0"). */
export async function openContactTab(page: Page, tab: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Secciones de la ficha' })
    .getByRole('link', { name: new RegExp(`^${tab}`) })
    .click();
}
