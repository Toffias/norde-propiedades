import { auditUpdated, toAuditValue, type Actor, type AuditState } from '../../shared';
import type { CompanySettingsView } from '../contracts';
import { COMPANY_SETTINGS_ID, type CompanySettings } from '../domain/company-settings';

import type { SettingsTransaction } from './ports/settings-transaction';

/** Lo que se audita de la configuración: valores crudos, por campo. */
export function companySettingsAuditState(settings: CompanySettings): AuditState {
  const s = settings.toSnapshot();
  return {
    name: s.name,
    logoKey: s.logoKey,
    timezone: s.timezone,
    webPropertyUrlTemplate: s.webPropertyUrlTemplate?.value,
    webDevelopmentUrlTemplate: s.webDevelopmentUrlTemplate?.value,
    newsScope: s.newsScope,
    watermark: toAuditValue(s.watermark.toProps()),
    portalDescriptionFooter: s.portalDescriptionFooter?.value,
    pdfOptions: toAuditValue(s.pdfOptions),
    emailFromName: s.emailSender.fromName,
    emailReplyTo: s.emailSender.replyTo?.value,
  };
}

/**
 * Guarda un cambio de configuración con su evento y su auditoría (solo los campos que cambiaron).
 * Si no cambió nada, no guarda ni audita, y devuelve `false`.
 */
export async function saveCompanySettingsChange(
  tx: SettingsTransaction,
  actor: Actor,
  settings: CompanySettings,
  before: AuditState,
): Promise<boolean> {
  const entry = auditUpdated(
    actor,
    {
      action: 'company_settings.updated',
      entityType: 'company_settings',
      entityId: COMPANY_SETTINGS_ID,
      clientIds: [],
    },
    before,
    companySettingsAuditState(settings),
  );
  const events = settings.pullEvents();
  if (!entry) return false;
  await tx.companySettings.save(settings, actor.id);
  await tx.events.publish(events);
  await tx.audit.record(entry);
  return true;
}

export function toCompanySettingsView(settings: CompanySettings): CompanySettingsView {
  const s = settings.toSnapshot();
  return {
    name: s.name,
    hasLogo: s.logoKey !== undefined,
    timezone: s.timezone,
    webPropertyUrlTemplate: s.webPropertyUrlTemplate?.value,
    webDevelopmentUrlTemplate: s.webDevelopmentUrlTemplate?.value,
    newsScope: s.newsScope,
    watermark: {
      enabled: s.watermark.enabled,
      hasLogo: s.watermark.logoKey !== undefined,
      sizePercent: s.watermark.sizePercent,
      position: s.watermark.position,
      opacity: s.watermark.opacity,
    },
    portalDescriptionFooter: s.portalDescriptionFooter?.value,
    pdfOptions: s.pdfOptions,
    emailSender: { fromName: s.emailSender.fromName, replyTo: s.emailSender.replyTo?.value },
  };
}
