/** Usuarios del panel (identity) que pueden tener contactos a cargo. */
export interface ClientAgents {
  /** Como mucho, los de una página. Los que no existen o no están activos no vuelven. */
  names(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** La sucursal de un agente activo; `undefined` si no existe o no está activo. */
  find(userId: string): Promise<{ readonly branchId: string | undefined } | undefined>;
}
