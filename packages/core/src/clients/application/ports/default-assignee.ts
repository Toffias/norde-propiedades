/**
 * El asesor por defecto para lo que se asigna solo (#208): el usuario activo que un administrador
 * marcó como tal en Usuarios (identity). Lo lee infra; clients solo conoce su ID y su sucursal.
 */
export interface DefaultAssignee {
  /** `undefined` si no hay ninguno marcado o está suspendido. */
  find(): Promise<{ readonly userId: string; readonly branchId: string } | undefined>;
}
