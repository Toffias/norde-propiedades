// Lo que comparten los módulos en la migración desde Tokko (#17).

/**
 * En Tokko, "Libre" y "Sin Asignar" son usuarios que se usaban como bolsa de contactos sin agente
 * (decidido con Norde el 2026-10-21): no se copian como usuarios y sus contactos quedan sin agente.
 */
const UNASSIGNED_AGENTS = new Set(['libre', 'sin asignar']);

export function isTokkoUnassignedAgent(name: string): boolean {
  const key = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return UNASSIGNED_AGENTS.has(key);
}
