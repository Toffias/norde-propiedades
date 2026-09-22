import type { CustomerTurnContext } from '../turn-context';

import { baseInstructions } from './base';
import { channelInstructions } from './channels';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function buildInstructions(context: CustomerTurnContext): string {
  const today = context.now.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  });
  return `${baseInstructions({ today, contactName: context.contactName })}\n\n${channelInstructions(context.channel)}`;
}
