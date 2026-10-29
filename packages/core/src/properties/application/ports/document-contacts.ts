/** Un contacto que se imprime en los PDF: el de la sucursal o el del agente. */
export interface DocumentContact {
  readonly name: string;
  readonly address: string | undefined;
  /** E.164 (`+5491166899124`). */
  readonly phone: string | undefined;
  /** E.164. */
  readonly whatsapp: string | undefined;
  readonly email: string | undefined;
}

/** Contactos del panel (identity) para el pie y la tarjeta de contacto de los PDF. */
export interface DocumentContacts {
  /** La sucursal (sin borrar); sin ID, o si ya no está, la casa central. */
  branch(branchId: string | undefined): Promise<DocumentContact | undefined>;
  /** Un usuario activo, con su teléfono y su email. `undefined` si no existe o no está activo. */
  user(userId: string): Promise<DocumentContact | undefined>;
}
