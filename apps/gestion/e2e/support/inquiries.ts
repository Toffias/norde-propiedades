import { createHmac, randomInt, randomUUID } from 'node:crypto';

import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { uniqueTag } from './properties';

// Consultas como las manda el formulario de la web (`POST /api/webhooks/inquiries/web`, firmado).
// Cada spec manda las suyas: el seed tiene pocas consultas y los specs corren en paralelo.

/** El secreto del webhook en los e2e. Lo comparte `playwright.config.ts` con el panel. */
export const E2E_INQUIRY_WEBHOOK_SECRET = 'e2e-only-inquiry-webhook-secret-00000000';

export interface WebInquiry {
  readonly externalId: string;
  readonly name: string;
  /** E.164. */
  readonly phone: string;
  readonly email: string;
  readonly message: string;
  readonly propertyId?: string;
}

/** Una persona nueva, con un teléfono y un email que no tiene ningún contacto. */
export function newPerson(): Omit<WebInquiry, 'externalId' | 'message' | 'propertyId'> {
  const tag = uniqueTag();
  return {
    name: `Persona E2E ${tag}`,
    // Celular de CABA: +54 9 11 y 8 dígitos.
    phone: `+54911${String(randomInt(10_000_000, 99_999_999))}`,
    email: `e2e-${tag}@norde.test`,
  };
}

/** Manda una consulta firmada y devuelve lo que se mandó. */
export async function sendWebInquiry(
  request: APIRequestContext,
  input: Partial<WebInquiry> = {},
): Promise<WebInquiry> {
  const inquiry: WebInquiry = {
    ...newPerson(),
    externalId: randomUUID(),
    message: 'Hola, quiero más información.',
    ...input,
  };
  const body = JSON.stringify(inquiry);
  const response = await request.post('/api/webhooks/inquiries/web', {
    data: body,
    headers: {
      'content-type': 'application/json',
      'x-norde-signature': sign(body),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return inquiry;
}

export function sign(body: string): string {
  return `sha256=${createHmac('sha256', E2E_INQUIRY_WEBHOOK_SECRET).update(body).digest('hex')}`;
}

/**
 * Asigna una consulta pendiente desde la bandeja (`/consultas`) y crea el contacto con sus datos:
 * así nace una oportunidad en "Nuevo". Necesita una sesión con `inquiries:manage`.
 */
export async function assignInquiryToNewContact(page: Page, inquiry: WebInquiry): Promise<void> {
  // La bandeja no tiene buscador: las pendientes van de la más nueva a la más vieja.
  await page.goto('/consultas');
  const card = page
    .getByRole('list', { name: 'Consultas pendientes' })
    .getByRole('listitem')
    .filter({ hasText: inquiry.name });
  await card.getByRole('button', { name: 'Asignar' }).click();

  const dialog = page.getByRole('dialog', { name: 'Asignar consulta' });
  await dialog.getByRole('button', { name: 'Crear cliente y asignar' }).click();
  await expect(page.getByText('Consulta asignada a un contacto nuevo')).toBeVisible();
}
