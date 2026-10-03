/**
 * La derivación por chances de los emprendimientos (#7), del módulo properties: los agentes que
 * reciben las consultas de un emprendimiento y su reparto ponderado. Va dentro de la transacción del
 * reparto, para que el turno y la asignación se guarden juntos.
 */
export interface DevelopmentChances {
  /**
   * Los agentes con chances del emprendimiento, en orden. Vacío si no deriva por chances: no tiene
   * agentes, está en la papelera o no existe.
   */
  agentsOf(developmentId: string): Promise<readonly string[]>;
  /**
   * El agente que recibe la próxima consulta, entre los activos, y avanza el reparto del
   * emprendimiento (bloqueado hasta el final de la transacción: dos consultas a la vez toman turnos
   * distintos). `undefined` si ninguno está activo; entonces no avanza.
   */
  takeTurn(developmentId: string, activeUserIds: ReadonlySet<string>): Promise<string | undefined>;
}
