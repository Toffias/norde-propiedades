/** Nombres de usuarios y sucursales del panel (identity), para mostrar quién hace qué. */
export interface PanelDirectory {
  /** Como mucho, los de una página. Los que no existen o no están activos no vuelven. */
  names(kind: 'user' | 'branch', ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

/** Usuarios del panel (identity) que pueden producir o hacer una tasación. */
export interface ActiveUsers {
  /** `undefined` si el usuario no existe o no está activo. */
  find(userId: string): Promise<{ readonly branchId: string | undefined } | undefined>;
}
