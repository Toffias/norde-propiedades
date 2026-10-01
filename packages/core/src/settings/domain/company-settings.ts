import { AggregateRoot } from '../../shared/domain/aggregate-root';
import { err, ok, type Result } from '../../shared/domain/result';
import type { Email } from '../../shared/domain/value-objects/email';

import type { CompanySettingsChanged, CompanySettingsSection } from './company-settings.events';
import type { DescriptionFooterTemplate } from './description-footer-template';
import { DEFAULT_PDF_OPTIONS, type PdfOptions } from './pdf-options';
import { Watermark } from './watermark';
import type { WebUrlTemplate } from './web-url-template';

/** La configuración es un único registro (mono-tenant): este es su ID en eventos y auditoría. */
export const COMPANY_SETTINGS_ID = 'company';
export type CompanySettingsId = typeof COMPANY_SETTINGS_ID;

/** Alcance del feed de Noticias: la sucursal del agente o todas. */
export const NEWS_SCOPES = ['branch', 'all'] as const;
export type NewsScope = (typeof NEWS_SCOPES)[number];

export const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';
const MAX_NAME_LENGTH = 120;
const MAX_FROM_NAME_LENGTH = 120;

export interface EmailSender {
  /** Nombre que ve el destinatario ("Norde Propiedades"). La dirección sale del entorno. */
  readonly fromName: string | undefined;
  readonly replyTo: Email | undefined;
}

export interface CompanySettingsSnapshot {
  readonly name: string;
  readonly logoKey: string | undefined;
  readonly timezone: string;
  readonly webPropertyUrlTemplate: WebUrlTemplate | undefined;
  readonly webDevelopmentUrlTemplate: WebUrlTemplate | undefined;
  readonly newsScope: NewsScope;
  readonly watermark: Watermark;
  readonly portalDescriptionFooter: DescriptionFooterTemplate | undefined;
  readonly pdfOptions: PdfOptions;
  readonly emailSender: EmailSender;
}

export type InvalidCompanySettingsError =
  | { readonly type: 'InvalidCompanyName' }
  | { readonly type: 'InvalidTimezone' }
  | { readonly type: 'InvalidSenderName' };

export interface GeneralSettings {
  readonly name: string;
  readonly timezone: string;
  readonly webPropertyUrlTemplate: WebUrlTemplate | undefined;
  readonly webDevelopmentUrlTemplate: WebUrlTemplate | undefined;
  readonly newsScope: NewsScope;
}

/**
 * Configuración general de Norde: datos de la empresa, marca de agua, pie para portales, ficha
 * y PDF, y remitente de los emails. Cada método cambia una sección y emite
 * `settings.company_settings_changed` con esa sección.
 */
export class CompanySettings extends AggregateRoot<CompanySettingsId, CompanySettingsChanged> {
  #state: CompanySettingsSnapshot;

  private constructor(state: CompanySettingsSnapshot) {
    super(COMPANY_SETTINGS_ID);
    this.#state = state;
  }

  /** Valores de fábrica, los mismos que deja la migración al crear la fila. */
  static defaults(): CompanySettings {
    return new CompanySettings({
      name: 'Norde Propiedades',
      logoKey: undefined,
      timezone: DEFAULT_TIMEZONE,
      webPropertyUrlTemplate: undefined,
      webDevelopmentUrlTemplate: undefined,
      newsScope: 'all',
      watermark: Watermark.disabled(),
      portalDescriptionFooter: undefined,
      pdfOptions: DEFAULT_PDF_OPTIONS,
      emailSender: { fromName: undefined, replyTo: undefined },
    });
  }

  static restore(snapshot: CompanySettingsSnapshot): CompanySettings {
    return new CompanySettings(snapshot);
  }

  get name(): string {
    return this.#state.name;
  }

  get logoKey(): string | undefined {
    return this.#state.logoKey;
  }

  get watermark(): Watermark {
    return this.#state.watermark;
  }

  updateGeneral(general: GeneralSettings, now: Date): Result<void, InvalidCompanySettingsError> {
    const name = general.name.trim();
    if (name === '' || name.length > MAX_NAME_LENGTH) return err({ type: 'InvalidCompanyName' });
    if (general.timezone.trim() === '') return err({ type: 'InvalidTimezone' });
    this.#state = { ...this.#state, ...general, name, timezone: general.timezone.trim() };
    this.changed('general', now);
    return ok(undefined);
  }

  /** Cambia el logo. Devuelve el anterior, para que el caso de uso lo borre del storage. */
  changeLogo(logoKey: string | undefined, now: Date): string | undefined {
    const previous = this.#state.logoKey;
    this.#state = { ...this.#state, logoKey };
    this.changed('general', now);
    return previous;
  }

  configureWatermark(watermark: Watermark, now: Date): void {
    this.#state = { ...this.#state, watermark };
    this.changed('watermark', now);
  }

  changePortalDescriptionFooter(footer: DescriptionFooterTemplate | undefined, now: Date): void {
    this.#state = { ...this.#state, portalDescriptionFooter: footer };
    this.changed('portals', now);
  }

  updatePdfOptions(pdfOptions: PdfOptions, now: Date): void {
    this.#state = { ...this.#state, pdfOptions };
    this.changed('pdf', now);
  }

  updateEmailSender(sender: EmailSender, now: Date): Result<void, InvalidCompanySettingsError> {
    const fromName = sender.fromName?.trim();
    if (fromName !== undefined && fromName.length > MAX_FROM_NAME_LENGTH) {
      return err({ type: 'InvalidSenderName' });
    }
    this.#state = {
      ...this.#state,
      emailSender: { fromName: fromName === '' ? undefined : fromName, replyTo: sender.replyTo },
    };
    this.changed('email', now);
    return ok(undefined);
  }

  toSnapshot(): CompanySettingsSnapshot {
    return this.#state;
  }

  private changed(section: CompanySettingsSection, now: Date): void {
    this.record({
      type: 'settings.company_settings_changed',
      aggregateId: COMPANY_SETTINGS_ID,
      occurredAt: now,
      payload: { section },
    });
  }
}
