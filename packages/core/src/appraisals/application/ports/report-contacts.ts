/** Un contacto que se imprime en el informe: el de la sucursal o el del tasador. */
export interface ReportContact {
  readonly name: string;
  readonly address: string | undefined;
  /** E.164 (`+5491166899124`). */
  readonly phone: string | undefined;
  /** E.164. */
  readonly whatsapp: string | undefined;
  readonly email: string | undefined;
}

/** Contactos del panel (identity) para el informe de la tasación. */
export interface ReportContacts {
  /** La sucursal (sin borrar); sin ID, o si ya no está, la casa central. */
  branch(branchId: string | undefined): Promise<ReportContact | undefined>;
  /** Un usuario activo, con su teléfono y su email. `undefined` si no existe o no está activo. */
  user(userId: string): Promise<ReportContact | undefined>;
}
