/** Pasa al contacto que queda las conversaciones de un duplicado unificado. */
export interface ClientConversationMerge {
  /** Las conversaciones del duplicado pasan al otro contacto. Devuelve sus IDs. Idempotente. */
  moveClient(fromClientId: string, toClientId: string): Promise<readonly string[]>;
}
