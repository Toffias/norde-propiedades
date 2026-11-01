import { getEnv } from '../../config/env';
import { getSiteUrl } from '../../lib/site-url';

import { ChatWidget } from './chat-widget';

const HOUR_MS = 3_600_000;

/** El chat con el agente de IA, si está configurado (`AGENT_CHAT_*`). */
export function SiteChat() {
  if (!isChatEnabled()) return null;
  return (
    <ChatWidget siteUrl={getSiteUrl()} idleResetMs={getEnv().CHAT_IDLE_RESET_HOURS * HOUR_MS} />
  );
}

export function isChatEnabled(): boolean {
  return getEnv().AGENT_CHAT_URL !== undefined;
}
