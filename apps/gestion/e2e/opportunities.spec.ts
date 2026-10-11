import { expect, test, type Page } from '@playwright/test';

import {
  assignInquiryToNewContact,
  sendWebInquiry,
  sign,
  type WebInquiry,
} from './support/inquiries';
import { uniqueTag } from './support/properties';
import { storageStateFor } from './support/users';

// Consultas (#10) y oportunidades (#9). Una oportunidad nace al asignar una consulta: cada test
// manda la suya por el webhook del formulario de la web y la asigna desde la bandeja.

test.use({ storageState: storageStateFor('admin') });

/** Una oportunidad nueva, en "Nuevo", a cargo del administrador que asignó la consulta. */
async function newOpportunity(page: Page): Promise<WebInquiry> {
  const inquiry = await sendWebInquiry(page.request);
  await assignInquiryToNewContact(page, inquiry);
  return inquiry;
}

async function openActions(page: Page, name: string): Promise<void> {
  await page.goto(`/oportunidades?q=${encodeURIComponent(name)}`);
  await page.getByRole('button', { name: `Acciones de la oportunidad de ${name}` }).click();
}

test.describe('webhook de consultas de la web', () => {
  test('una consulta firmada entra a la bandeja como pendiente', async ({ page }) => {
    const inquiry = await sendWebInquiry(page.request, {
      message: `Quiero visitar el departamento ${uniqueTag()}`,
    });

    await page.goto('/consultas');
    const card = page
      .getByRole('list', { name: 'Consultas pendientes' })
      .getByRole('listitem')
      .filter({ hasText: inquiry.name });
    await expect(card.getByText(inquiry.message)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Asignar' })).toBeVisible();
  });

  test('rechaza una firma inválida', async ({ request }) => {
    const body = JSON.stringify({ externalId: crypto.randomUUID(), name: 'Sin firma válida' });

    const response = await request.post('/api/webhooks/inquiries/web', {
      data: body,
      headers: { 'content-type': 'application/json', 'x-norde-signature': 'sha256=00' },
    });

    expect(response.status()).toBe(401);
  });

  test('rechaza un cuerpo inválido aunque esté firmado', async ({ request }) => {
    const body = JSON.stringify({ externalId: 'no-es-un-uuid' });

    const response = await request.post('/api/webhooks/inquiries/web', {
      data: body,
      headers: { 'content-type': 'application/json', 'x-norde-signature': sign(body) },
    });

    expect(response.status()).toBe(400);
  });

  test('un reintento con el mismo ID no duplica la consulta', async ({ request }) => {
    const inquiry = await sendWebInquiry(request);
    const body = JSON.stringify(inquiry);

    const retry = await request.post('/api/webhooks/inquiries/web', {
      data: body,
      headers: { 'content-type': 'application/json', 'x-norde-signature': sign(body) },
    });

    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({ duplicate: true });
  });
});

test.describe('pipeline', () => {
  test('asignar una consulta crea el contacto y la oportunidad en "Nuevo"', async ({ page }) => {
    const inquiry = await newOpportunity(page);

    await page.goto(`/oportunidades?q=${encodeURIComponent(inquiry.name)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Oportunidades' })).toBeVisible();
    const contactLink = page.getByRole('link', { name: inquiry.name, exact: true });
    await expect(contactLink).toBeVisible();

    await contactLink.click();
    await expect(page).toHaveURL(/\/contactos\/[0-9a-f-]{36}\?tab=oportunidades/);
    await expect(page.getByRole('heading', { level: 1, name: inquiry.name })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Oportunidades del contacto' })).toContainText(
      'Nuevo',
    );
  });

  test('se ve en el tablero, en la columna "Nuevo"', async ({ page }) => {
    const inquiry = await newOpportunity(page);

    await page.goto(`/oportunidades?vista=tablero&q=${encodeURIComponent(inquiry.name)}`);

    const column = page.getByRole('region', { name: /^Nuevo: / });
    await expect(
      column.getByRole('article', { name: `Oportunidad de ${inquiry.name}` }),
    ).toBeVisible();
  });

  test('pasa a otro estado desde el menú', async ({ page }) => {
    const inquiry = await newOpportunity(page);

    await openActions(page, inquiry.name);
    await page.getByRole('menuitem', { name: 'Contactado' }).click();

    await expect(page.getByText('Pasó a "Contactado"')).toBeVisible();
    await page.goto(`/oportunidades?vista=tablero&q=${encodeURIComponent(inquiry.name)}`);
    await expect(
      page
        .getByRole('region', { name: /^Contactado: / })
        .getByRole('article', { name: `Oportunidad de ${inquiry.name}` }),
    ).toBeVisible();
  });

  test('agrega una nota y queda en su historial', async ({ page }) => {
    const inquiry = await newOpportunity(page);
    const note = `Quiere visitar el sábado ${uniqueTag()}`;

    await page.goto(`/oportunidades?q=${encodeURIComponent(inquiry.name)}`);
    await page.getByRole('button', { name: `Nota a la oportunidad de ${inquiry.name}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Nota de la oportunidad' });
    await dialog.getByLabel('Nota').fill(note);
    await dialog.getByRole('button', { name: 'Guardar nota' }).click();
    await expect(page.getByText('Nota agregada')).toBeVisible();

    await page
      .getByRole('button', { name: `Historial de la oportunidad de ${inquiry.name}` })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Historial de la oportunidad' }).getByText(note),
    ).toBeVisible();
  });

  test('se cierra con un motivo y ya no se puede cambiar', async ({ page }) => {
    const inquiry = await newOpportunity(page);

    await openActions(page, inquiry.name);
    await page.getByRole('menuitem', { name: 'Cerrar…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cerrar la oportunidad' });
    const close = dialog.getByRole('button', { name: 'Cerrar oportunidad' });
    await expect(close).toBeDisabled();
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: /^Dejó de buscar/ }).click();
    await close.click();

    await expect(page.getByText('Oportunidad cerrada')).toBeVisible();
    await page.goto(`/oportunidades?q=${encodeURIComponent(inquiry.name)}&category=lost`);
    await expect(page.getByRole('link', { name: inquiry.name, exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Acciones de la oportunidad de ${inquiry.name}` }),
    ).toHaveCount(0);
  });
});

test.describe('reasignación y alcance por agente', () => {
  test('el agente ve solo las que tiene a cargo', async ({ page, browser }) => {
    const inquiry = await newOpportunity(page);
    const agent = await browser.newContext({ storageState: storageStateFor('agent') });
    const agentPage = await agent.newPage();

    await agentPage.goto(`/oportunidades?q=${encodeURIComponent(inquiry.name)}`);
    await expect(agentPage.getByText('No hay oportunidades con estos filtros.')).toBeVisible();

    await openActions(page, inquiry.name);
    await page.getByRole('menuitem', { name: 'Reasignar…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reasignar la oportunidad' });
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: /Camila Agente/ }).click();
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Oportunidad reasignada')).toBeVisible();

    await agentPage.reload();
    await expect(agentPage.getByRole('link', { name: inquiry.name, exact: true })).toBeVisible();
    await expect(
      agentPage.getByRole('link', { name: 'Oportunidades' }).getByLabel(/nuevas? asignadas?/),
    ).toBeVisible();
    await agent.close();
  });
});
