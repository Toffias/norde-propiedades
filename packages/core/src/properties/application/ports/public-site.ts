/**
 * El sitio público (apps/web). Cachea fichas y listados hasta que el sistema le avisa que algo
 * cambió (ADR 0023).
 */
export interface PublicSite {
  /** Vuelve a armar la ficha de la propiedad y los listados donde aparece. */
  revalidateProperty(propertyId: string): Promise<void>;
}
