/** Nombres de usuarios del panel (identity), para mostrar quién captó o borró una propiedad. */
export interface UserNames {
  /** Como mucho, los de una página. Los que no existen o no están activos no vuelven. */
  names(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
