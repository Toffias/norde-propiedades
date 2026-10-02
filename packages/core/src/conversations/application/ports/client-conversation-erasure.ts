/** El borrado físico de las conversaciones de clientes suprimidos (Ley 25.326). */
export interface ClientConversationErasure {
  /** Borra las conversaciones vinculadas a estos clientes, con sus mensajes. Devuelve cuántas. */
  eraseForClients(clientIds: readonly string[]): Promise<number>;
}
