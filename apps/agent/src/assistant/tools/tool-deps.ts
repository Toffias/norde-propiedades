import type { RegisterContact } from '@norde/core/clients';
import type { GetPropertyDetail, SearchProperties } from '@norde/core/properties';
import type { Actor } from '@norde/core/shared';

/** Casos de uso que llaman las tools, con el actor del agente (`system:agent-ia`). */
export interface AssistantToolDeps {
  readonly actor: Actor;
  readonly siteUrl: string;
  readonly searchProperties: Pick<SearchProperties, 'execute'>;
  readonly getPropertyDetail: Pick<GetPropertyDetail, 'execute'>;
  readonly registerContact: Pick<RegisterContact, 'execute'>;
}

/** Un error que no debería pasar nunca (permisos mal configurados, por ejemplo). */
export class UnexpectedToolError extends Error {
  constructor(tool: string, reason: string) {
    super(`${tool}: ${reason}`);
    this.name = 'UnexpectedToolError';
  }
}
