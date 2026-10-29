import type { Page } from '@playwright/test';

// Fallas de red armadas a mano: el pedido llega al servidor, que lo procesa, pero el navegador no
// recibe la respuesta. Es lo que pasa con un corte de wifi justo después de "Guardar".

/**
 * La próxima Server Action cuyo cuerpo incluya `marker` llega al servidor y su respuesta se pierde.
 * Las demás pasan normalmente.
 */
export async function loseNextActionResponse(page: Page, marker: string): Promise<void> {
  let lost = false;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const isAction = request.method() === 'POST' && request.headers()['next-action'] !== undefined;
    if (!lost && isAction && (request.postData() ?? '').includes(marker)) {
      lost = true;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.fallback();
  });
}
