import type { OpportunityNotification, TeamNotifier } from '@norde/core/clients';

import { maskEmail, maskPhone, type InfraLogger } from '../../shared/logger';

/**
 * POST JSON a un endpoint del equipo (Slack o Teams incoming webhook, Zapier, n8n…).
 * Si responde con error, lanza: el job que lo llama se reintenta.
 */
export class WebhookTeamNotifier implements TeamNotifier {
  constructor(
    private readonly options: {
      readonly url: string;
      readonly token?: string | undefined;
      readonly fetch?: typeof fetch;
    },
  ) {}

  async notifyOpportunity(notification: OpportunityNotification): Promise<void> {
    const response = await (this.options.fetch ?? fetch)(this.options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
      },
      body: JSON.stringify({
        event: notification.kind === 'new' ? 'opportunity.created' : 'opportunity.follow_up',
        ...notification,
        occurredAt: notification.occurredAt.toISOString(),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Team webhook responded ${response.status}`);
  }
}

/** Sin canal configurado: deja constancia en el log (sin datos personales en claro). */
export class LogTeamNotifier implements TeamNotifier {
  constructor(private readonly logger: InfraLogger) {}

  notifyOpportunity(notification: OpportunityNotification): Promise<void> {
    this.logger.info(
      {
        opportunity: {
          ...notification,
          phone: notification.phone && maskPhone(notification.phone),
          email: notification.email && maskEmail(notification.email),
        },
      },
      notification.kind === 'new'
        ? 'NUEVA OPORTUNIDAD (sin TEAM_WEBHOOK_URL configurado)'
        : 'EL CLIENTE VOLVIÓ A CONSULTAR (sin TEAM_WEBHOOK_URL configurado)',
    );
    return Promise.resolve();
  }
}
