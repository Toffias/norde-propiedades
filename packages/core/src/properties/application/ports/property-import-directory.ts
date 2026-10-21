import type { Actor } from '../../../shared';

/** Un usuario activo del panel (identity) que puede quedar como productor. */
export interface ImportProducerCandidate {
  readonly userId: string;
  readonly name: string;
  readonly branchId: string | undefined;
}

/** Un emprendimiento que puede tener la propiedad como unidad. */
export interface ImportDevelopmentCandidate {
  readonly id: string;
  readonly name: string;
}

/** El propietario que trae la fila, para buscarlo o crearlo en contactos (clients). */
export interface ImportOwner {
  readonly name: string;
  readonly phone: string | undefined;
  readonly email: string | undefined;
  /** Si la propiedad se vende, se alquila o las dos. */
  readonly sells: boolean;
  readonly rents: boolean;
  /** El productor de la propiedad: queda a cargo del contacto nuevo. */
  readonly agentId: string | undefined;
  /** El ID del contacto en Tokko (desde la API): sin teléfono ni email, alcanza con él. */
  readonly tokkoId: string | undefined;
}

/**
 * Lo que la importación de Tokko busca afuera de la propiedad: el productor (identity), el
 * emprendimiento por nombre y el propietario (clients, por su API pública).
 */
export interface PropertyImportDirectory {
  /**
   * Los usuarios activos cuyo nombre contiene este (sin distinguir mayúsculas ni acentos), como
   * mucho una página. El caso de uso elige el que tiene el mismo nombre.
   */
  searchProducers(name: string): Promise<readonly ImportProducerCandidate[]>;
  /** Los emprendimientos cuyo nombre contiene este, como mucho una página. */
  searchDevelopments(name: string): Promise<readonly ImportDevelopmentCandidate[]>;
  /**
   * El contacto con ese ID de Tokko, teléfono o email (la regla de duplicados de contactos) o uno
   * nuevo como propietario. `undefined` si no tiene un teléfono ni un email válidos ni ID de Tokko,
   * o si pidió la supresión de sus datos.
   */
  findOrCreateOwner(
    owner: ImportOwner,
    actor: Actor,
  ): Promise<{ readonly clientId: string } | undefined>;
}
