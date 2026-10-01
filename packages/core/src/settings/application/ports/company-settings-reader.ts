import type { CompanySettings } from '../../domain/company-settings';

/**
 * Lectura de la configuración fuera de una transacción: la usan las queries del panel y los demás
 * módulos (portales, PDF, propiedades) para leer los valores que su dominio necesita.
 */
export interface CompanySettingsReader {
  get(): Promise<CompanySettings>;
}
