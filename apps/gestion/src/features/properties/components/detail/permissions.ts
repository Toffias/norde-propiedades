/**
 * Qué acciones muestra la ficha. Es solo para la pantalla: cada caso de uso vuelve a decidir la
 * autorización con el actor.
 */
export interface DetailPermissions {
  /** Editar esta propiedad (las propias, las de la sucursal o todas, según sus permisos). */
  readonly edit: boolean;
  readonly publish: boolean;
  readonly changeProducer: boolean;
  readonly markAvailable: boolean;
  readonly export: boolean;
  readonly history: boolean;
  readonly contacts: boolean;
}
