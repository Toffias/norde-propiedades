/** Nombres de las sucursales (identity). */
export interface BranchNames {
  /** Como mucho, las de una página. Las que no existen no vuelven. */
  names(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
