/** De dónde viene un ID externo. Por ahora solo Tokko Broker (#17). */
export type ExternalIdSource = 'tokko';

export interface ClientExternalId {
  readonly clientId: string;
  /** El cliente pidió la supresión de sus datos: no se vuelve a crear. */
  readonly erased: boolean;
}

/**
 * El ID que un contacto tiene en otro sistema (`import_mappings`). Con él, importar dos veces la
 * misma planilla no duplica contactos.
 */
export interface ClientExternalIds {
  find(source: ExternalIdSource, externalId: string): Promise<ClientExternalId | undefined>;
  /** Si el ID ya estaba vinculado, no cambia. */
  link(input: {
    readonly source: ExternalIdSource;
    readonly externalId: string;
    readonly clientId: string;
    readonly now: Date;
  }): Promise<void>;
}
