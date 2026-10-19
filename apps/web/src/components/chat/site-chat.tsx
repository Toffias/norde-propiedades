import { getEnv } from '../../config/env';
import { getSiteUrl } from '../../lib/site-url';

import { ChatWidget } from './chat-widget';

/** El chat con el agente de IA, si está configurado (`AGENT_CHAT_*`). */
export function SiteChat() {
  if (!isChatEnabled()) return null;
  return <ChatWidget siteUrl={getSiteUrl()} />;
}

export function isChatEnabled(): boolean {
  return getEnv().AGENT_CHAT_URL !== undefined;
}
