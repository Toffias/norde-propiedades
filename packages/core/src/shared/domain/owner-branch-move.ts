/**
 * Un lote de registros de un usuario que pasan de su sucursal anterior a la nueva (#221): los que
 * tienen a `ownerId` como dueño y todavía están en `fromBranchId`, también los de la papelera.
 */
export interface OwnerBranchMove {
  readonly ownerId: string;
  readonly fromBranchId: string;
  readonly toBranchId: string;
  /** Como mucho estos por llamada: el caso de uso repite hasta que no queda nada. */
  readonly limit: number;
  /** Queda como `updated_by`. */
  readonly actorId: string;
  readonly now: Date;
}
