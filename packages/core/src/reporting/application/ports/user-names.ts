/** Nombres de usuarios del panel (identity), para mostrar el agente de cada fila. */
export interface ReportingUserNames {
  /** Como mucho, los de una página. Los que no existen o no están activos no vuelven. */
  names(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
