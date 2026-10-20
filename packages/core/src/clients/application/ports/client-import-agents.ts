/** Un usuario activo del panel (identity) que puede quedar a cargo de los contactos importados. */
export interface ImportAgentCandidate {
  readonly userId: string;
  readonly name: string;
  readonly branchId: string | undefined;
}

/** Los agentes que se buscan por el nombre de la columna "Agente" de una planilla. */
export interface ClientImportAgents {
  /**
   * Los usuarios activos cuyo nombre contiene este (sin distinguir mayúsculas ni acentos), como
   * mucho una página. El caso de uso elige el que tiene el mismo nombre.
   */
  searchByName(name: string): Promise<readonly ImportAgentCandidate[]>;
}
