import type { DomainEvent } from '../../shared/domain/domain-event';

export const COMPANY_SETTINGS_SECTIONS = [
  'general',
  'watermark',
  'portals',
  'pdf',
  'email',
] as const;
export type CompanySettingsSection = (typeof COMPANY_SETTINGS_SECTIONS)[number];

/** Cambió una sección de la configuración: quien cachea valores (portales, PDF) los recarga. */
export type CompanySettingsChanged = DomainEvent<
  'settings.company_settings_changed',
  { readonly section: CompanySettingsSection }
>;
