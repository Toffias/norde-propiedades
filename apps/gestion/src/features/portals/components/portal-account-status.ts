import type { PortalAccountView, PortalValue } from '@norde/core/portals/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

const CONNECT_PATH = '/api/portals/mercadolibre/connect';

/** La ruta que arranca la autorización en MercadoLibre para esa cuenta. */
export function connectHref(portal: PortalValue): string {
  return `${CONNECT_PATH}?${new URLSearchParams({ portal }).toString()}`;
}

export function accountStatus(account: PortalAccountView): { tone: StatusTone; label: string } {
  if (!account.isConnected) return { tone: 'gray', label: 'Sin conectar' };
  // Una cuenta que todavía no publica nada no se activa.
  if (account.publishes.length === 0) return { tone: 'green', label: 'Conectada' };
  return account.isEnabled
    ? { tone: 'green', label: 'Activa' }
    : { tone: 'amber', label: 'Conectada, sin activar' };
}
