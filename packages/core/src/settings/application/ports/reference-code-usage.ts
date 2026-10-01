/** Si un código de referencia ya lo usa una propiedad o un emprendimiento (por ejemplo, cargado a mano). */
export interface ReferenceCodeUsage {
  isTaken(code: string): Promise<boolean>;
}
